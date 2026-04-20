import express from 'express';
import { getCategories, createCategory, deleteCategory } from '../controllers/categoryController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

import { validate } from '../middleware/validate.js';
import { categorySchema } from '../validations/categorySchema.js';

const router = express.Router();

router.get('/', getCategories);
router.post('/', protect, admin, validate(categorySchema), createCategory);
router.delete('/:id', protect, admin, deleteCategory);

export default router;
