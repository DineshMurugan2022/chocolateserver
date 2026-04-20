import express from 'express';
import multer from 'multer';
import { 
    getProducts, 
    getProductById,
    getRelatedProducts,
    createProduct, 
    updateProduct, 
    deleteProduct 
} from '../controllers/productController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

import { validate } from '../middleware/validate.js';
import { productCreateSchema, productUpdateSchema } from '../validations/productSchema.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', getProducts);
router.get('/:id', getProductById);
router.get('/:id/related', getRelatedProducts);

// Protected Admin Routes
router.post(
    '/', 
    protect, 
    admin, 
    upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 5 }]), 
    validate(productCreateSchema),
    createProduct
);

router.put(
    '/:id', 
    protect, 
    admin, 
    upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 5 }]), 
    validate(productUpdateSchema),
    updateProduct
);

router.delete('/:id', protect, admin, deleteProduct);

export default router;
