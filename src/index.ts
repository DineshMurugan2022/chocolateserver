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
import { connectRedis } from './utils/cache.js';

import { createServer } from 'http';
import { Server } from 'socket.io';
import { rateLimit } from 'express-rate-limit';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [config.client_url, "http://localhost:5173", "https://chocolate1-gamma.vercel.app"],
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

let viewerCount = 0;
const productViewers: Record<string, number> = {};

io.on('connection', (socket) => {
  viewerCount++;
  io.emit('updateViewerCount', viewerCount);
  console.log('Client connected:', socket.id, 'Total viewers:', viewerCount);
  
  socket.on('joinProduct', (productId) => {
    socket.join(`product:${productId}`);
    productViewers[productId] = (productViewers[productId] || 0) + 1;
    io.to(`product:${productId}`).emit('updateProductViewers', { productId, count: productViewers[productId] });
  });

  socket.on('leaveProduct', (productId) => {
    socket.leave(`product:${productId}`);
    if (productViewers[productId]) {
      productViewers[productId] = Math.max(0, productViewers[productId] - 1);
      io.to(`product:${productId}`).emit('updateProductViewers', { productId, count: productViewers[productId] });
    }
  });

  socket.on('disconnect', () => {
    viewerCount--;
    io.emit('updateViewerCount', viewerCount);
    // Cleanup product viewers (simplification: just emit general update, or track socket rooms)
    console.log('Client disconnected', 'Total viewers:', viewerCount);
  });

  // Simulate or trigger real sales updates
  socket.on('triggerSale', (saleData) => {
    // saleData: { productName, customerName, time }
    io.emit('newSale', saleData);
  });
});

app.use(cors({
  origin: [config.client_url, "http://localhost:5173", "https://chocolate1-gamma.vercel.app"],
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

// MongoDB Connection
mongoose.connect(config.mongodb_uri, {
  serverSelectionTimeoutMS: 5000,
  family: 4 // Force IPv4
})
  .then(() => {
    console.log('Connected to MongoDB');
    connectRedis();
  })
  .catch((err: any) => console.log('MongoDB connection error:', err));

app.get('/', (req: express.Request, res: express.Response) => {
  res.send('ChocoLux API is running... Visit <a href="/api-docs">/api-docs</a> for documentation.');
});

// Centralized Error Handling
app.use(errorHandler);

import fs from 'fs';

process.on('uncaughtException', (err) => {
  const log = `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err.message}\nStack: ${err.stack}\n`;
  fs.appendFileSync('fatal_error.log', log);
  console.error(log);
});

process.on('unhandledRejection', (reason: any) => {
  const log = `[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason?.message || reason}\nStack: ${reason?.stack}\n`;
  fs.appendFileSync('fatal_error.log', log);
  console.error(log);
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});