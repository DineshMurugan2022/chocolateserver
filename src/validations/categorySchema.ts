import { z } from 'zod';

export const categorySchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Category name must be at least 2 characters'),
  }),
});
