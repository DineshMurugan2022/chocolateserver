import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config.js';
import productRoutes from './routes/productRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './utils/swagger.js';
import { connectRedis, incr, decr, hIncrBy, hGetAll } from './utils/cache.js';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { logger } from './utils/logger.js';

import { createServer } from 'http';
import { Server } from 'socket.io';
import { rateLimit } from 'express-rate-limit';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: config.client_url,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = config.port;

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests from this IP' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many auth attempts' }
});

const socketProducts = new Map<string, Set<string>>();

io.on('connection', async (socket) => {
  const currentTotal = await incr('viewer_count');
  io.emit('updateViewerCount', currentTotal);
  console.log('Client connected:', socket.id, 'Total viewers:', currentTotal);
  
  socket.on('joinProduct', async (productId) => {
    socket.join(`product:${productId}`);
    const joined = socketProducts.get(socket.id) || new Set<string>();
    if (!joined.has(productId)) {
      joined.add(productId);
      const count = await hIncrBy('product_viewers', productId, 1);
      socketProducts.set(socket.id, joined);
      io.to(`product:${productId}`).emit('updateProductViewers', { productId, count });
    }
  });

  socket.on('leaveProduct', async (productId) => {
    socket.leave(`product:${productId}`);
    const joined = socketProducts.get(socket.id);
    if (joined && joined.has(productId)) {
      joined.delete(productId);
      socketProducts.set(socket.id, joined);
      const count = await hIncrBy('product_viewers', productId, -1);
      io.to(`product:${productId}`).emit('updateProductViewers', { productId, count: Math.max(0, count) });
    }
  });

  socket.on('disconnect', async () => {
    const currentTotal = await decr('viewer_count');
    io.emit('updateViewerCount', currentTotal);
    
    const joined = socketProducts.get(socket.id);
    if (joined) {
      for (const productId of joined) {
        const count = await hIncrBy('product_viewers', productId, -1);
        io.to(`product:${productId}`).emit('updateProductViewers', { productId, count: Math.max(0, count) });
      }
      socketProducts.delete(socket.id);
    }
    console.log('Client disconnected', 'Total viewers:', currentTotal);
  });

  // Simulate or trigger real sales updates
  socket.on('triggerSale', (saleData) => {
    // saleData: { productName, customerName, time }
    io.emit('newSale', saleData);
  });
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://res.cloudinary.com"],
      connectSrc: ["'self'", "ws:", "wss:", "http://localhost:5000", config.client_url],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cookieParser());
app.use(cors({
  origin: config.client_url,
  credentials: true
}));
app.use(limiter);
app.use(express.json());
app.set('socketio', io);

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Centralized Error Handling
app.use(errorHandler);

process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION', err);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('UNHANDLED REJECTION', { reason });
});

const startServer = async () => {
  try {
    await mongoose.connect(config.mongodb_uri, {
      serverSelectionTimeoutMS: 5000,
      family: 4 // Force IPv4
    });
    logger.info('Connected to MongoDB');

    try {
      await connectRedis();
    } catch (redisErr) {
      logger.warn('Failed to connect to Redis. Running without caching/viewer features.', redisErr);
    }

    httpServer.listen(PORT, () => {
      logger.info(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err: unknown) {
    logger.error('Fatal initialization error:', err);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('Shutting down gracefully...');
  httpServer.close(async () => {
    await mongoose.connection.close();
    logger.info('Services closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
