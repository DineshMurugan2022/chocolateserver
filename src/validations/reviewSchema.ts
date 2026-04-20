import { z } from 'zod';

export const reviewSchema = z.object({
  body: z.object({
    rating: z.number().min(1).max(5),
    comment: z.string().min(3, 'Comment must be at least 3 characters'),
    product: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Product ID').optional(), // Sometimes passed in body, sometimes in params
  }),
});
