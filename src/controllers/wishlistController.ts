import type { Request, Response } from 'express';
import User from '../models/User.js';
import { NotFoundError } from '../utils/errors.js';

export const getWishlist = async (req: Request, res: Response) => {
  try {
    // Assuming user ID is available in req.user (from auth middleware)
    // If auth is not fully implemented, we'll use a placeholder or handle guests
    const userId = (req as any).user?.id; 
    
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const user = await User.findById(userId).populate('wishlist');
    if (!user) throw new NotFoundError('User not found');

    res.status(200).json(user.wishlist);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleWishlist = async (req: Request, res: Response) => {
  try {
    const { productId } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    const wishlist = (user as any).wishlist || [];
    const index = wishlist.findIndex((id: any) => id.toString() === productId.toString());

    if (index === -1) {
      wishlist.push(productId);
    } else {
      wishlist.splice(index, 1);
    }

    (user as any).wishlist = wishlist;
    await user.save();

    const updatedUser = await User.findById(userId).populate('wishlist');
    res.status(200).json(updatedUser?.wishlist || []);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
