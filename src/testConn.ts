import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const testConn = async () => {
  console.log('Testing connection to:', process.env.MONGODB_URI?.replace(/:([^@]+)@/, ':****@'));
  try {
    await mongoose.connect(process.env.MONGODB_URI!, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('Successfully connected to MongoDB Atlas!');
    process.exit(0);
  } catch (err: unknown) {
    console.error('Connection failed!');
    if (err instanceof Error) {
      console.error('Error Name:', err.name);
      console.error('Error Message:', err.message);
    } else {
      console.error('Error Message:', String(err));
    }
    if (typeof err === 'object' && err !== null && 'reason' in err) {
      const reason = (err as { reason?: unknown }).reason;
      if (reason) console.error('Reason:', reason);
    }
    process.exit(1);
  }
};

testConn();
