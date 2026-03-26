import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  category: string;
  image: string; // Cloudinary URL
  images: string[]; // Additional gallery images
  model3d?: string; // Path to .glb file
  ingredients: string[];
  stock: number;
  weight: string;
  rating: number;
  reviews: number;
}

const ProductSchema: Schema = new Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  image: { type: String, required: true },
  images: [{ type: String }],
  model3d: { type: String },
  ingredients: [{ type: String }],
  stock: { type: Number, default: 0 },
  weight: { type: String },
  rating: { type: Number, default: 0 },
  reviews: { type: Number, default: 0 },
}, { timestamps: true });

ProductSchema.index({ name: 'text', description: 'text', category: 'text' });
ProductSchema.index({ category: 1 });

export default mongoose.model<IProduct>('Product', ProductSchema);
