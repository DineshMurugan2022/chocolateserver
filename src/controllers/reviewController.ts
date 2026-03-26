import type { Request, Response } from 'express';
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';

export const addReview = async (req: any, res: Response) => {
  try {
    const { productId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if user already reviewed
    const existingReview = await Review.findOne({ user: userId, product: productId });
    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this product' });
    }

    // Check for verified purchase (if user has a 'paid' order containing this product)
    const hasPurchased = await Order.findOne({
      user: userId,
      status: 'paid',
      'items.product': productId
    });

    const review = new Review({
      user: userId,
      product: productId,
      rating,
      comment,
      isVerified: !!hasPurchased
    });

    await review.save();

    // Update Product Rating
    const reviews = await Review.find({ product: productId });
    const numReviews = reviews.length;
    const avgRating = reviews.reduce((acc, item) => item.rating + acc, 0) / numReviews;

    product.rating = parseFloat(avgRating.toFixed(1));
    product.reviews = numReviews;
    await product.save();

    res.status(201).json(review);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getProductReviews = async (req: Request, res: Response) => {
  try {
    const productId = req.params['productId'] as string;
    const reviews = await Review.find({ product: productId as any })
      .populate('user', 'name')
      .sort({ createdAt: -1 });
    
    res.json(reviews);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
