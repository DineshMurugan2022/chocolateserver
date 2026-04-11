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
    if (!origin) return callback(null, true);
    
    const normalizedOrigin = origin.replace(/\/$/, '');
    const isAllowed = config.allowed_origins.some(ao => ao === normalizedOrigin);

    if (isAllowed || config.node_env === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
};

// CORS Preflight - Manual Handler for maximum reliability
app.use((req, res, next) => {
  const origin = req.headers.origin as string;
  const normalizedOrigin = origin ? origin.replace(/\/$/, '') : '';
  
  if (config.allowed_origins.includes(normalizedOrigin) || config.node_env === 'development') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Initialize Socket.io with robust CORS
const io = new Server(httpServer, {
  cors: corsOptions
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
    const currentTotal = await decr('viewer_count');
    io.emit('updateViewerCount', currentTotal);
  });
});

app.use(limiter);
app.set('socketio', io);

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
    logger.info(`Server is running on port ${PORT}. Connecting to database in background...`);
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
    logger.info('Services closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
