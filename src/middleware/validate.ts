import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export const validate = (schema: any) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        const issues = error.issues || (error as any).errors || [];
        logger.warn(`Validation failed: ${req.method} ${req.path}`, { issues });
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          details: issues.map((e: any) => ({ path: e.path.join('.'), message: e.message }))
        });
      }
      next(error);
    }
  };
};
