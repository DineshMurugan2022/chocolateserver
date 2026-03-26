import type { Request, Response } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../config.js';

const razorpay = new Razorpay({
  key_id: config.razorpay.key_id!,
  key_secret: config.razorpay.key_secret!,
});

const updateProductStock = async (items: any[]) => {
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

export const createRazorpayOrder = async (req: Request, res: Response) => {
  try {
    const { items, receipt } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    // Calculate total on server to prevent price tampering
    let calculatedAmount = 0;
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) throw new Error(`Product ${item.name} not found`);
      calculatedAmount += product.price * item.quantity;
    }

    const options = {
      amount: Math.round(calculatedAmount * 100), // paise
      currency: 'INR',
      receipt,
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json(order);
  } catch (error: any) {
    console.error('Razorpay Order Error:', error);
    res.status(500).json({ message: 'Error creating Razorpay order', error: error.message });
  }
};

export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderData // Custom data from frontend
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.key_secret!)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // ATOMIC STOCK CHECK AND UPDATE
      try {
        await updateProductStock(orderData.items);
      } catch (stockError: any) {
        return res.status(400).json({ status: 'failure', message: stockError.message });
      }

      // Payment is successful, save order to DB
      const newOrder = new Order({
        ...orderData,
        razorpay_order_id,
        razorpay_payment_id,
        status: 'paid'
      });

      const savedOrder = await newOrder.save();
      
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
  } catch (error: any) {
    console.error('Payment Verification Error:', error);
    res.status(500).json({ message: 'Error verifying payment', error: error.message });
  }
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    const { items, totalPrice, user, shippingAddress } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    // ATOMIC STOCK CHECK AND UPDATE
    try {
      await updateProductStock(items);
    } catch (stockError: any) {
      return res.status(400).json({ message: stockError.message });
    }

    const order = new Order({
      user,
      items,
      shippingAddress,
      totalPrice,
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
  } catch (error: any) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Error creating order', error: error.message });
  }
};

export const getOrders = async (_req: Request, res: Response) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching orders', error: error.message });
  }
};

export const getUserOrders = async (req: any, res: Response) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching user orders', error: error.message });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const order = await Order.findByIdAndUpdate(id, { status }, { new: true })
            .populate('user', 'name email');
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        
        res.json(order);
    } catch (error: any) {
        res.status(500).json({ message: 'Error updating order status', error: error.message });
    }
};
