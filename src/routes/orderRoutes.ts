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

const router = express.Router();

router.post('/', protect, createOrder);
router.get('/', protect, admin, getOrders);
router.get('/my-orders', protect, getUserOrders);
router.post('/razorpay/order', protect, createRazorpayOrder);
router.post('/razorpay/verify', protect, verifyPayment);
router.patch('/:id/status', protect, admin, updateOrderStatus);

export default router;
