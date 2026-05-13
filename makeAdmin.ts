import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';

dotenv.config();

const makeAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/choco');
    
    // Check if admin exists
    let admin = await User.findOne({ email: 'admin@choco.com' });
    if (!admin) {
      admin = await User.create({
        name: 'Admin',
        email: 'admin@choco.com',
        password: 'password123',
        role: 'admin'
      });
      console.log('Created new admin user');
    } else {
      admin.role = 'admin';
      await admin.save();
      console.log('Updated existing user to admin');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

makeAdmin();
