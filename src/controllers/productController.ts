import type { Request, Response } from 'express';
import Product from '../models/Product.js';
import { uploadImage } from '../utils/cloudinary.js';
import { getCache, setCache, deleteCache } from '../utils/cache.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import mongoose from 'mongoose';

type ProductQuery = {
  $or?: Array<{
    name?: { $regex: string; $options: 'i' };
    description?: { $regex: string; $options: 'i' };
  }>;
  category?: string;
  price?: { $gte?: number; $lte?: number };
};

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { search, category, minPrice, maxPrice, sort } = req.query;
    const searchValue = typeof search === 'string' ? search : undefined;
    const categoryValue = typeof category === 'string' ? category : undefined;
    const minPriceValue = typeof minPrice === 'string' ? minPrice : undefined;
    const maxPriceValue = typeof maxPrice === 'string' ? maxPrice : undefined;
    const sortValue = typeof sort === 'string' ? sort : undefined;
    
    // Default: use cache for all products if no filters are applied
    if (!searchValue && !categoryValue && !minPriceValue && !maxPriceValue && !sortValue) {
      const cachedProducts = await getCache('products');
      if (cachedProducts) {
        return res.status(200).json(cachedProducts);
      }
    }

    const query: ProductQuery = {};
    if (searchValue) {
      query.$or = [
        { name: { $regex: searchValue, $options: 'i' } },
        { description: { $regex: searchValue, $options: 'i' } }
      ];
    }
    if (categoryValue) query.category = categoryValue;
    if (minPriceValue || maxPriceValue) {
      query.price = {};
      if (minPriceValue) query.price.$gte = Number(minPriceValue);
      if (maxPriceValue) query.price.$lte = Number(maxPriceValue);
    }

    let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
    if (sortValue === 'priceLow') sortOption = { price: 1 };
    if (sortValue === 'priceHigh') sortOption = { price: -1 };
    if (sortValue === 'name') sortOption = { name: 1 };

    const products = await Product.find(query).sort(sortOption);

    // Only cache the "all products" view
    if (!searchValue && !categoryValue && !minPriceValue && !maxPriceValue && !sortValue) {
      await setCache('products', products, 3600);
    }
    
    res.status(200).json(products);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message });
  }
};

export const getProductById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw new NotFoundError('Product not found');
    res.status(200).json(product);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message });
  }
};

export const getRelatedProducts = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const related = await Product.find({
      category: product.category,
      _id: { $ne: product._id }
    }).limit(4);

    res.status(200).json(related);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const product = { ...req.body };
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    
    // Handle main image
    if (files?.image?.[0]) {
      const imageUrl = await uploadImage(files.image[0].buffer);
      product.image = imageUrl;
    }

    // Handle gallery images
    const galleryUrls: string[] = [];
    
    // 1. Files from multer
    if (files?.images) {
      for (const file of files.images) {
        const url = await uploadImage(file.buffer);
        galleryUrls.push(url as string);
      }
    }

    // 2. URLs from body (if user pasted URLs separated by comma or something)
    // Actually, AdminDashboard will send them as part of FormData
    // If Admin sends them as strings in the 'images' field (not file), they might be in req.body.images
    if (req.body.images) {
      const existingImages = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
      galleryUrls.push(...existingImages.filter((url: string) => typeof url === 'string'));
    }

    product.images = galleryUrls;

    const newProduct = new Product(product);
    await newProduct.save();
    
    // Invalidate cache
    await deleteCache('products');
    
    // Emit real-time change
    const io = req.app.get('socketio');
    if (io) io.emit('productCreated', newProduct);
    
    res.status(201).json(newProduct);
  } catch (error: unknown) {
    console.error('Create Product Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message });
  }
};

export const updateProduct = async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const product = { ...req.body };
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  // Remove immutable fields
  delete product._id;
  delete product.__v;
  delete product.createdAt;
  delete product.updatedAt;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid Product ID format');
    }

    // Handle main image
    if (files?.image?.[0]) {
      const imageUrl = await uploadImage(files.image[0].buffer);
      product.image = imageUrl;
    }

    // Handle gallery images
    const galleryUrls: string[] = [];
    
    // 1. Files from multer
    if (files?.images) {
      for (const file of files.images) {
        const url = await uploadImage(file.buffer);
        galleryUrls.push(url as string);
      }
    }

    // 2. Existing URLs from body (for products that didn't change images)
    if (req.body.images) {
      const existingImages = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
      galleryUrls.push(...existingImages.filter((url: string) => typeof url === 'string'));
    }

    product.images = galleryUrls;

    const updatedProduct = await Product.findByIdAndUpdate(id, product, { new: true });
    if (!updatedProduct) throw new NotFoundError('Product not found');

    // Invalidate cache
    await deleteCache('products');
    
    // Emit real-time change
    try {
      const io = req.app.get('socketio');
      if (io) io.emit('productUpdated', updatedProduct);
    } catch (socketErr) {
      console.error('Socket.io Emit Error (non-fatal):', socketErr);
    }

    res.status(200).json(updatedProduct);
  } catch (error: unknown) {
    console.error('Update Product Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message });
  }
};

export const deleteProduct = async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  try {
    const deletedProduct = await Product.findByIdAndDelete(id);
    if (!deletedProduct) throw new NotFoundError('Product not found');

    // Invalidate cache
    await deleteCache('products');
    
    // Emit real-time change
    const io = req.app.get('socketio');
    if (io) io.emit('productDeleted', id);

    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error: unknown) {
    console.error('Delete Product Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message });
  }
};
