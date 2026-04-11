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
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = config.allowed_origins;
    // Check if the exact origin is allowed, or if it's a vercel subdomain of the primary project
    const isAllowed = allowedOrigins.some(ao => {
      const normalizedAO = ao.replace(/\/$/, '');
      const normalizedOrigin = origin.replace(/\/$/, '');
      return normalizedAO === normalizedOrigin;
    });

    if (isAllowed || (config.node_env === 'development')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
};

// Initialize Socket.io with robust CORS
const io = new Server(httpServer, {
  cors: corsOptions
});

const PORT = config.port;

// Base Middlewares - applied BEFORE everything else to ensure CORS/Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://res.cloudinary.com"],
      connectSrc: ["'self'", "ws:", "wss:", "http://localhost:5000", ...config.allowed_origins],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// Rate Limiting - applied after CORS
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

app.use(limiter);
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
