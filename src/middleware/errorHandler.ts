import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { ZodError } from 'zod';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Something went wrong!';
  let details: any = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    details = err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
  } else if (err instanceof Error) {
    message = err.message;
  }

  logger.error(`${req.method} ${req.path}`, err);

  res.status(statusCode).json({
    status: 'error',
    message,
    ...(config.node_env === 'development' && { stack: err.stack }),
  });
};
