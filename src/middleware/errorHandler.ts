import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { config } from '../config.js';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Something went wrong!';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
  }

  console.error(`[Error] ${req.method} ${req.path}:`, err.stack);

  res.status(statusCode).json({
    status: 'error',
    message,
    ...(config.node_env === 'development' && { stack: err.stack }),
  });
};
