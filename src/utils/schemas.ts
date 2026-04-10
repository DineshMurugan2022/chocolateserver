import { z } from 'zod';

export const orderItemSchema = z.object({
  product: z.string(),
  name: z.string().optional(),
  quantity: z.number().int().positive().default(1),
});

export const shippingAddressSchema = z.object({
  name: z.string().min(2, 'Name is too short'),
  email: z.string().email('Invalid email address'),
  phoneNumber: z.string().min(10, 'Invalid phone number'),
  address: z.string().min(5, 'Address is too short'),
  city: z.string().min(2, 'City name is too short'),
  postalCode: z.string().min(5, 'Invalid postal code'),
});

export const createOrderSchema = z.object({
  body: z.object({
    items: z.array(orderItemSchema).min(1, 'Order must contain at least one item'),
    shippingAddress: shippingAddressSchema,
    receipt: z.string().optional(),
  })
});

export const updateOrderStatusSchema = z.object({
  body: z.object({
    status: z.enum(['pending', 'processing', 'completed', 'cancelled', 'paid']),
  }),
  params: z.object({
    id: z.string(),
  })
});

export const verifyPaymentSchema = z.object({
  body: z.object({
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string(),
  })
});
