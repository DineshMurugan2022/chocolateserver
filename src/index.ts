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
import { connectRedis, incr, decr, hIncrBy, hGetAll, disconnectRedis } from './utils/cache.js';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { logger } from './utils/logger.js';

import { createServer } from 'http';
import { Server } from 'socket.io';
import { rateLimit } from 'express-rate-limit';

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Render/Vercel)
const httpServer = createServer(app);
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    const normalizedOrigin = origin ? origin.replace(/\/$/, '') : '';
    const isAllowed = !origin || 
                     config.allowed_origins.includes(normalizedOrigin) || 
                     config.node_env === 'development' ||
                     normalizedOrigin.endsWith('vercel.app') || // Fail-safe for Vercel
                     normalizedOrigin === 'https://british-chocolate.com' || // Fail-safe for production domain
                     normalizedOrigin === 'https://www.british-chocolate.com'; // www variant
    
    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked for origin: ${origin}. Allowed origins: ${config.allowed_origins.join(', ')}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
};

// Initialize Socket.io with robust CORS
// origin: true mirrors the request Origin header — safe, standard, and avoids any matching bugs
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
    methods: ["GET", "POST"]
  }
});

const PORT = config.port;

// Base Middlewares
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

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests from this IP' }
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

  socket.on('disconnect', async () => {
    // 1. Decrement Global Viewers
    const currentTotal = await decr('viewer_count');
    io.emit('updateViewerCount', currentTotal);

    // 2. Decrement Product Viewers for all joined products
    const joined = socketProducts.get(socket.id);
    if (joined) {
      for (const productId of joined) {
        const count = await hIncrBy('product_viewers', productId, -1);
        io.to(`product:${productId}`).emit('updateProductViewers', { productId, count });
      }
      socketProducts.delete(socket.id);
    }
    
    console.log('Client disconnected:', socket.id, 'Active viewers:', currentTotal);
  });
});

// DB Readiness Guard — return 503 instead of 500 when MongoDB is not connected
app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({ message: 'Database not ready yet, please retry in a few seconds.' });
    return;
  }
  next();
});

app.use(limiter);
app.set('socketio', io);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    env: config.node_env
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Centralized Error Handling - ensure CORS is still present
app.use((err: any, req: any, res: any, next: any) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  errorHandler(err, req, res, next);
});

const startServer = async () => {
  // 1. START LISTENING IMMEDIATELY for Render health checks
  httpServer.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}.`);
    logger.info(`Allowed Origins: ${config.allowed_origins.join(', ')}`);
    logger.info(`Connecting to database in background...`);
  });

  // 2. CONNECT TO DATABASE IN BACKGROUND
  try {
    await mongoose.connect(config.mongodb_uri, {
      serverSelectionTimeoutMS: 10000,
      family: 4 
    });
    logger.info('Connected to MongoDB');

    try {
      await connectRedis();
    } catch (redisErr) {
      logger.warn('Failed to connect to Redis.', redisErr);
    }
  } catch (err: unknown) {
    logger.error('Database connection error:', err);
    // We don't exit here so the server stays alive and can respond with errors
  }
};

startServer();

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('Shutting down gracefully...');
  httpServer.close(async () => {
    await mongoose.connection.close();
    await disconnectRedis();
    logger.info('Services closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
