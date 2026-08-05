import { z } from 'zod';

const shippingAddressSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phoneNumber: z.string().min(10, 'Invalid phone number'),
  address: z.string().min(5, 'Address is too short'),
  city: z.string().min(2, 'City is required'),
  postalCode: z.string().min(5, 'Invalid postal code'),
});

const cartItemSchema = z.object({
  product: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Product ID'),
  quantity: z.number().int().positive().optional().default(1),
  name: z.string().optional(),
});

export const orderCreateSchema = z.object({
  body: z.object({
    items: z.array(cartItemSchema).min(1, 'Order must have at least one item'),
    shippingAddress: shippingAddressSchema,
    receipt: z.string().optional(),
  }),
});

export const verifyPaymentSchema = z.object({
  body: z.object({
    razorpay_order_id: z.string().min(1, 'Razorpay Order ID is required'),
    razorpay_payment_id: z.string().min(1, 'Razorpay Payment ID is required'),
    razorpay_signature: z.string().min(1, 'Razorpay Signature is required'),
    orderId: z.string().optional(),
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Order ID format'),
  }),
  body: z.object({
    status: z.enum(['pending', 'processing', 'completed', 'cancelled', 'paid']),
  }),
});
