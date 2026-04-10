import type { Response } from 'express';
import User from '../models/User.js';
import { NotFoundError, UnauthorizedError } from '../utils/errors.js';
import type { AuthRequest } from '../types/requests.js';
import { Types } from 'mongoose';

type ToggleWishlistBody = { productId: string };

export const getWishlist = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const user = await User.findById(userId).populate('wishlist');
    if (!user) throw new NotFoundError('User profile not found');

    res.status(200).json(user.wishlist);
  } catch (error: unknown) {
    const status = error instanceof Error && 'status' in error ? (error as any).status : 500;
    const message = error instanceof Error ? error.message : 'Internal Server Error during wishlist retrieval';
    res.status(status).json({ message });
  }
};

export const toggleWishlist = async (
  req: AuthRequest<ToggleWishlistBody>,
  res: Response
) => {
  try {
    const { productId } = req.body;
    const userId = req.user?._id;

    if (!userId) throw new UnauthorizedError('Authentication required');
    if (!productId) throw new NotFoundError('Product identifier is missing');

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User profile not found');

    const productObjectId = new Types.ObjectId(productId);
    const wishlist = user.wishlist || [];
    const itemIndex = wishlist.findIndex(id => id.toString() === productId);

    if (itemIndex === -1) {
      wishlist.push(productObjectId as any);
    } else {
      wishlist.splice(itemIndex, 1);
    }

    user.wishlist = wishlist;
    await user.save();

    // Populate the newly updated wishlist
    const updatedUser = await User.findById(userId).populate('wishlist');
    res.status(200).json(updatedUser?.wishlist || []);
  } catch (error: unknown) {
    const status = error instanceof Error && 'status' in error ? (error as any).status : 500;
    const message = error instanceof Error ? error.message : 'Internal Server Error during wishlist modification';
    res.status(status).json({ message });
  }
};
