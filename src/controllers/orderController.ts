import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../config.js';
import type { AuthRequest } from '../types/requests.js';

type CartItemInput = {
  product: string;
  quantity?: number;
  name?: string;
};

type OrderItem = {
  product: Types.ObjectId | string;
  name: string;
  price: number;
  quantity: number;
};

type ShippingAddress = {
  name: string;
  email: string;
  phoneNumber: string;
  address: string;
  city: string;
  postalCode: string;
};

type OrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled' | 'paid';

type RazorpayOrderBody = {
  items: CartItemInput[];
  receipt?: string;
  shippingAddress?: ShippingAddress;
};

type CreateOrderBody = {
  items: CartItemInput[];
  shippingAddress?: ShippingAddress;
};

type VerifyPaymentBody = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

type UpdateOrderStatusBody = {
  status: OrderStatus;
};

const razorpay = new Razorpay({
  key_id: config.razorpay.key_id!,
  key_secret: config.razorpay.key_secret!,
});

const updateProductStock = async (items: OrderItem[]) => {
  for (const item of items) {
    const product = await Product.findOneAndUpdate(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { new: true }
    );
    if (!product) {
      throw new Error(`Insufficient stock for product: ${item.name}`);
    }
  }
};

export const createRazorpayOrder = async (req: AuthRequest<RazorpayOrderBody>, res: Response) => {
  try {
    const { items, receipt, shippingAddress } = req.body;

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }
    if (!shippingAddress) {
      return res.status(400).json({ message: 'Shipping address is required' });
    }

    // Calculate total on server to prevent price tampering
    let calculatedAmount = 0;
    const orderItems: OrderItem[] = [];
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) throw new Error(`Product ${item.name} not found`);
      const quantity = Number(item.quantity || 1);
      calculatedAmount += product.price * quantity;
      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity
      });
    }

    const options = {
      amount: Math.round(calculatedAmount * 100), // paise
      currency: 'INR',
      receipt: receipt || `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    // Create a pending order in DB linked to Razorpay order
    const pendingOrder = await Order.create({
      user: req.user._id,
      items: orderItems,
      shippingAddress,
      totalPrice: calculatedAmount,
      status: 'pending',
      razorpay_order_id: order.id
    });

    res.status(200).json({ order, orderId: pendingOrder._id });
  } catch (error: unknown) {
    console.error('Razorpay Order Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message: 'Error creating Razorpay order', error: message });
  }
};

export const verifyPayment = async (
  req: Request<Record<string, string>, unknown, VerifyPaymentBody>,
  res: Response
) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ status: 'failure', message: 'Missing Razorpay verification fields' });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.key_secret!)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      const existingOrder = await Order.findOne({ razorpay_order_id });
      if (!existingOrder) {
        return res.status(404).json({ status: 'failure', message: 'Order not found' });
      }

      if (existingOrder.status === 'paid') {
        return res.status(200).json({ status: 'success', order: existingOrder });
      }

      // ATOMIC STOCK CHECK AND UPDATE
      try {
        await updateProductStock(existingOrder.items as OrderItem[]);
      } catch (stockError: unknown) {
        const message = stockError instanceof Error ? stockError.message : 'Stock update failed';
        return res.status(400).json({ status: 'failure', message });
      }

      existingOrder.razorpay_payment_id = razorpay_payment_id;
      existingOrder.status = 'paid';
      const savedOrder = await existingOrder.save();
      
      const io = req.app.get('socketio');
      if (io) {
        io.emit('newOrder', savedOrder);
        // Social proof notification
        if (savedOrder.items?.[0] && savedOrder.shippingAddress) {
          io.emit('newSale', { 
            productName: savedOrder.items[0].name,
            customerName: savedOrder.shippingAddress.name
          });
        }
      }

      res.status(200).json({ status: 'success', order: savedOrder });
    } else {
      res.status(400).json({ status: 'failure', message: 'Invalid signature' });
    }
  } catch (error: unknown) {
    console.error('Payment Verification Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message: 'Error verifying payment', error: message });
  }
};

export const createOrder = async (req: AuthRequest<CreateOrderBody>, res: Response) => {
  try {
    const { items, shippingAddress } = req.body;

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }
    if (!shippingAddress) {
      return res.status(400).json({ message: 'Shipping address is required' });
    }

    const preparedItems: OrderItem[] = [];
    let calculatedTotal = 0;
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) throw new Error(`Product ${item.name} not found`);
      const quantity = Number(item.quantity || 1);
      calculatedTotal += product.price * quantity;
      preparedItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity
      });
    }

    // ATOMIC STOCK CHECK AND UPDATE
    try {
      await updateProductStock(preparedItems);
    } catch (stockError: unknown) {
      const message = stockError instanceof Error ? stockError.message : 'Stock update failed';
      return res.status(400).json({ message });
    }

    const order = new Order({
      user: req.user._id,
      items: preparedItems,
      shippingAddress,
      totalPrice: calculatedTotal,
      status: 'pending'
    });

    const savedOrder = await order.save();
    
    // Emit via socket if needed for admin real-time updates
    const io = req.app.get('socketio');
    if (io) {
      io.emit('newOrder', savedOrder);
      // Social proof notification
      if (savedOrder.items?.[0] && savedOrder.shippingAddress) {
        io.emit('newSale', { 
          productName: savedOrder.items[0].name,
          customerName: savedOrder.shippingAddress.name
        });
      }
    }

    res.status(201).json(savedOrder);
  } catch (error: unknown) {
    console.error('Error creating order:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message: 'Error creating order', error: message });
  }
};

export const getOrders = async (_req: Request, res: Response) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message: 'Error fetching orders', error: message });
  }
};

export const getUserOrders = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message: 'Error fetching user orders', error: message });
  }
};

export const updateOrderStatus = async (
  req: Request<{ id: string }, unknown, UpdateOrderStatusBody>,
  res: Response
) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const order = await Order.findByIdAndUpdate(id, { status }, { new: true })
            .populate('user', 'name email');
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        
        res.json(order);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message: 'Error updating order status', error: message });
    }
};
