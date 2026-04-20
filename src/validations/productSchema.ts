import { z } from 'zod';

export const productCreateSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    price: z.preprocess((val) => Number(val), z.number().positive('Price must be positive')),
    category: z.string().min(1, 'Category is required'),
    stock: z.preprocess((val) => Number(val || 0), z.number().int().nonnegative()).optional(),
    weight: z.string().optional(),
    brand: z.string().optional(),
    cacaoContent: z.string().optional(),
    notes: z.string().optional(),
    events: z.array(z.string()).optional().or(z.string().transform(s => [s])).optional(),
    ingredients: z.array(z.string()).optional().or(z.string().transform(s => [s])).optional(),
  }),
});

export const productUpdateSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Product ID format'),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().min(10).optional(),
    price: z.preprocess((val) => val === undefined ? undefined : Number(val), z.number().positive().optional()),
    category: z.string().optional(),
    stock: z.preprocess((val) => val === undefined ? undefined : Number(val), z.number().int().nonnegative().optional()),
    weight: z.string().optional(),
    brand: z.string().optional(),
    cacaoContent: z.string().optional(),
    notes: z.string().optional(),
    events: z.array(z.string()).optional().or(z.string().transform(s => [s])).optional(),
    ingredients: z.array(z.string()).optional().or(z.string().transform(s => [s])).optional(),
  }).partial(),
});
