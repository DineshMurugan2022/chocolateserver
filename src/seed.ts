import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Category from './models/Category.js';
import { connectRedis, deleteCache } from './utils/cache.js';

dotenv.config();

const products = [
  {
    name: "Mandala Mix 200g",
    price: 1250,
    weight: "200G",
    category: "Cylindrical Collection",
    image: "https://images.unsplash.com/photo-1548907602-1f062e2a608a?auto=format&fit=crop&q=80&w=1000",
    description: "A ceremonial blend of single-origin beans, technically processed for maximum aromatic potential.",
    stock: 50,
    ingredients: ["70% Cocoa", "Organic Cane Sugar", "Bourbon Vanilla"]
  },
  {
    name: "Lyra Maximum",
    price: 1450,
    weight: "200G",
    category: "Heritage Registry",
    image: "https://images.unsplash.com/photo-1542859953-d98cb0bb5fec?auto=format&fit=crop&q=80&w=1000",
    description: "The peak of our botanical registry. A complex structural masterpiece with heavy texture.",
    stock: 35,
    ingredients: ["85% Dark Chocolate", "Cacao Nibs", "Sea Salt"]
  },
  {
    name: "Colombia Origin 70%",
    price: 850,
    weight: "90G",
    category: "Single Estate",
    image: "https://images.unsplash.com/photo-1581467655410-0c2bf55d9d6c?auto=format&fit=crop&q=80&w=1000",
    description: "Sourced from our high-altitude Colombian estate. Features notes of red fruit and tobacco.",
    stock: 120,
    ingredients: ["Colombia Cocoa Beans", "Organic Honey"]
  },
  {
    name: "Botanical Essence",
    price: 1100,
    weight: "150G",
    category: "Aromatic Blend",
    image: "https://images.unsplash.com/photo-1610450949065-1f2842426002?auto=format&fit=crop&q=80&w=1000",
    description: "Infused with botanical extracts and floral essence for a molecular taste experience.",
    stock: 45,
    ingredients: ["Floral Distillate", "White Chocolate", "Saffron"]
  },
  {
    name: "Dark Alchemy",
    price: 1350,
    weight: "180G",
    category: "Noir Series",
    image: "https://images.unsplash.com/photo-1549488344-1f9b8d2bd1f3?auto=format&fit=crop&q=80&w=1000",
    description: "A dark chocolate synthesis that challenges the boundaries of traditional culinary science.",
    stock: 60,
    ingredients: ["90% Raw Cacao", "Activated Charcoal", "Smoked Salt"]
  },
  {
    name: "Silk Road Nibs",
    price: 950,
    weight: "120G",
    category: "Crunch Matrix",
    image: "https://images.unsplash.com/photo-1553272725-086100aecf5e?auto=format&fit=crop&q=80&w=1000",
    description: "Features precision-roasted nibs that provide a rhythmic crunch within a silky matrix.",
    stock: 200,
    ingredients: ["Milk Chocolate", "Roasted Cacao Nibs"]
  },
  {
    name: "Golden Leaf Ganache",
    price: 2100,
    weight: "250G",
    category: "Royal Edition",
    image: "https://images.unsplash.com/photo-1621213170401-443da872ec56?auto=format&fit=crop&q=80&w=1000",
    description: "A regal artifact featuring edible gold leaf and a core of triple-fermented ganache.",
    stock: 15,
    ingredients: ["24K Gold Leaf", "Dark Ganache", "Cream"]
  },
  {
    name: "Midnight Truffle",
    price: 1800,
    weight: "200G",
    category: "Twilight Selection",
    image: "https://images.unsplash.com/photo-1548365328-8c6dc3b2b5da?auto=format&fit=crop&q=80&w=1000",
    description: "Indulgent truffles technically curated for deep twilight consumption and reflection.",
    stock: 30,
    ingredients: ["Hazelnut Praline", "Venetian Truffle Oil"]
  },
  {
    name: "Floral Infusion",
    price: 1050,
    weight: "100G",
    category: "Botanical Series",
    image: "https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&q=80&w=1000",
    description: "A delicate synthesis of rose and lavender, balanced by the richness of botanical cocoa.",
    stock: 85,
    ingredients: ["Rose Petals", "Lavender Extract", "White Chocolate"]
  },
  {
    name: "Zest & Spice",
    price: 1150,
    weight: "110G",
    category: "Spice Registry",
    image: "https://images.unsplash.com/photo-1504940892017-d23b905bbdce?auto=format&fit=crop&q=80&w=1000",
    description: "A high-precision blend of citrus zest and architectural spices for a sharp finish.",
    stock: 40,
    ingredients: ["Orange Zest", "Cardamom", "Chili Threads"]
  },
  {
    name: "Velvet Cacao",
    price: 1600,
    weight: "160G",
    category: "Smooth Synthesis",
    image: "https://images.unsplash.com/photo-1587049352846-4a222e783137?auto=format&fit=crop&q=80&w=1000",
    description: "Experience the smoothest texture in our registry, achieved through ultra-fine velvet processing.",
    stock: 25,
    ingredients: ["Ultra-fine Cocoa", "Heavy Cream", "Maple Syrup"]
  }
];

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    
    // Seed Products
    await Product.deleteMany();
    await Product.insertMany(products);
    console.log('Database Seeded Successfully with ' + products.length + ' Botanical Artifacts');

    // Seed Categories
    await Category.deleteMany();
    const uniqueCategories = [...new Set(products.map(p => p.category))];
    const categoryDocs = uniqueCategories.map(name => ({ name }));
    await Category.insertMany(categoryDocs);
    console.log('Categories Seeded Successfully: ' + uniqueCategories.join(', '));

    // Clear Cache
    try {
      await connectRedis();
      await deleteCache('products');
      console.log('Cache invalidated for Registry');
    } catch (cacheErr) {
      console.log('Redis not reachable, skipping cache invalidation');
    }

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seedDB();
