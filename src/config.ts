import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const mongoUriSchema = z.string().default('mongodb://localhost:27017/chocolux').refine(
  (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
  { message: 'Invalid MongoDB URI format' }
);

const envSchema = z.object({
  PORT: z.string().default('5000'),
  MONGODB_URI: mongoUriSchema,
  JWT_SECRET: z.string().min(8).default('secret_at_least_8_chars'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
});

const env = envSchema.parse(process.env);

if (env.NODE_ENV === 'production' && env.JWT_SECRET === 'secret_at_least_8_chars') {
  console.warn('JWT_SECRET is using the default value in production. Set a strong secret in the environment.');
}

const allowedOrigins = env.CLIENT_URL
  ? env.CLIENT_URL.split(',').map(url => url.trim().replace(/\/$/, ''))
  : ['http://localhost:5173'];

export const config = {
  port: parseInt(env.PORT, 10),
  mongodb_uri: env.MONGODB_URI,
  jwt_secret: env.JWT_SECRET,
  redis_url: env.REDIS_URL,
  node_env: env.NODE_ENV,
  client_url: env.CLIENT_URL,
  allowed_origins: allowedOrigins,
  cloudinary: {
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  },
  razorpay: {
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  }
};
