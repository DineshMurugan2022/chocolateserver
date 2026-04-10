import express from 'express';
import { 
    createOrder, 
    getOrders, 
    createRazorpayOrder, 
    verifyPayment, 
    updateOrderStatus,
    getUserOrders
} from '../controllers/orderController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

import { validate } from '../middleware/validate.js';
import { createOrderSchema, verifyPaymentSchema, updateOrderStatusSchema } from '../utils/schemas.js';

const router = express.Router();

router.post('/', protect, validate(createOrderSchema), createOrder);
router.get('/', protect, admin, getOrders);
router.get('/my-orders', protect, getUserOrders);
router.post('/razorpay/order', protect, validate(createOrderSchema), createRazorpayOrder);
router.post('/razorpay/verify', protect, validate(verifyPaymentSchema), verifyPayment);
router.patch('/:id/status', protect, admin, validate(updateOrderStatusSchema), updateOrderStatus);

export default router;
