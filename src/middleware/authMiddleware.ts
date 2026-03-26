import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req: any, res: Response, next: NextFunction) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      if (!process.env.JWT_SECRET) {
        console.error('CRITICAL: JWT_SECRET is not defined in environment variables');
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
      
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        console.warn(`Auth Failure: User not found for ID ${decoded.id}`);
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      req.user = user;
      next();
    } catch (error: any) {
      console.error('Auth Middleware Error:', error.message);
      res.status(401).json({ message: `Not authorized, token failed: ${error.message}` });
    }
  }

  if (!token) {
    console.warn('Auth Failure: No token provided in headers');
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const admin = (req: any, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin' });
  }
};
