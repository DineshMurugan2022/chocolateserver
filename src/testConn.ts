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
  } catch (err: any) {
    console.error('Connection failed!');
    console.error('Error Name:', err.name);
    console.error('Error Message:', err.message);
    if (err.reason) console.error('Reason:', err.reason);
    process.exit(1);
  }
};

testConn();
