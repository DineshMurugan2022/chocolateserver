import { createClient } from 'redis';
import { config } from '../config.js';

const client = createClient({
  url: config.redis_url
});

client.on('error', (err) => console.log('Redis Client Error', err));

let isConnected = false;

export const connectRedis = async () => {
  if (!isConnected) {
    try {
      await client.connect();
      isConnected = true;
      console.log('Connected to Redis');
    } catch (error) {
      console.error('Could not connect to Redis:', error);
    }
  }
};

export const getCache = async <T>(key: string): Promise<T | null> => {
  if (!isConnected) return null;
  const data = await client.get(key);
  return data ? (JSON.parse(data) as T) : null;
};

export const setCache = async <T>(key: string, value: T, duration: number = 3600) => {
  if (!isConnected) return;
  await client.setEx(key, duration, JSON.stringify(value));
};

export const deleteCache = async (key: string) => {
  if (!isConnected) return;
  await client.del(key);
};

export const incr = async (key: string) => {
  if (!isConnected) return 0;
  return await client.incr(key);
};

export const decr = async (key: string) => {
  if (!isConnected) return 0;
  const val = await client.decr(key);
  if (val < 0) {
    await client.set(key, 0);
    return 0;
  }
  return val;
};

export const hIncrBy = async (key: string, field: string, value: number) => {
  if (!isConnected) return 0;
  return await client.hIncrBy(key, field, value);
};

export const hGetAll = async (key: string) => {
  if (!isConnected) return {};
  return await client.hGetAll(key);
};
