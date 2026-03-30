import type { Response } from 'express';
import User from '../models/User.js';
import { NotFoundError } from '../utils/errors.js';
import type { AuthRequest } from '../types/requests.js';

type ToggleWishlistBody = { productId: string };

export const getWishlist = async (req: AuthRequest, res: Response) => {
  try {
    // Assuming user ID is available in req.user (from auth middleware)
    // If auth is not fully implemented, we'll use a placeholder or handle guests
    const userId = req.user?._id?.toString(); 
    
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const user = await User.findById(userId).populate('wishlist');
    if (!user) throw new NotFoundError('User not found');

    res.status(200).json(user.wishlist);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message });
  }
};

export const toggleWishlist = async (
  req: AuthRequest<ToggleWishlistBody>,
  res: Response
) => {
  try {
    const { productId } = req.body;
    const userId = req.user?._id?.toString();

    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    const wishlist = user.wishlist ?? [];
    const index = wishlist.findIndex((id) => id.toString() === productId.toString());

    if (index === -1) {
      wishlist.push(productId);
    } else {
      wishlist.splice(index, 1);
    }

    user.wishlist = wishlist;
    await user.save();

    const updatedUser = await User.findById(userId).populate('wishlist');
    res.status(200).json(updatedUser?.wishlist || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message });
  }
};
