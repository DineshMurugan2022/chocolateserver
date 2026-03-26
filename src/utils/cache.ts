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

export const getCache = async (key: string) => {
  if (!isConnected) return null;
  const data = await client.get(key);
  return data ? JSON.parse(data) : null;
};

export const setCache = async (key: string, value: any, duration: number = 3600) => {
  if (!isConnected) return;
  await client.setEx(key, duration, JSON.stringify(value));
};

export const deleteCache = async (key: string) => {
  if (!isConnected) return;
  await client.del(key);
};
