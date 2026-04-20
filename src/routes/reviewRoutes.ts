import express from 'express';
import { addReview, getProductReviews } from '../controllers/reviewController.js';
import { protect } from '../middleware/authMiddleware.js';

import { validate } from '../middleware/validate.js';
import { reviewSchema } from '../validations/reviewSchema.js';

const router = express.Router();

router.get('/:productId', getProductReviews);
router.post('/:productId', protect, validate(reviewSchema), addReview);

export default router;
