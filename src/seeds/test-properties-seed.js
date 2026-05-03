/**
 * TEST PROPERTIES SEED
 * ─────────────────────────────────────────
 * Run: node src/seeds/test-properties-seed.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const Property = require('../models/property.model');
const User     = require('../models/user.model');

const SEED_OWNER_EMAIL = 'owner@luxeestates.com';

const TEST_PROPERTIES = [
  {
    title: 'Modern Downtown Studio Apartment',
    description: 'A cozy and modern studio apartment located in the heart of the city. Perfect for young professionals. High-speed internet and all utilities included.',
    price: 1500,
    currency: 'USD',
    type: 'studio',
    listingType: 'rent',
    status: 'available',
    location: {
      city: 'New York',
      district: 'Manhattan',
      street: '5th Avenue'
    },
    area: 45,
    bedrooms: 1,
    bathrooms: 1,
    features: ['Furnished', 'AC', 'Wifi', 'City View'],
    images: [
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80'
    ],
    isApproved: true
  },
  {
    title: 'Mediterranean Luxury Villa',
    description: 'Spacious villa with a private pool and garden. Offers stunning sunset views and ultimate privacy. Features a gourmet kitchen and grand living spaces.',
    price: 2500000,
    currency: 'EUR',
    type: 'villa',
    listingType: 'sale',
    status: 'available',
    location: {
      city: 'Nice',
      district: 'Mont Boron',
      street: 'Boulevard de la Corne d\'Or'
    },
    area: 350,
    bedrooms: 5,
    bathrooms: 4,
    features: ['Pool', 'Garden', 'Security System', 'Garage', 'Terrace'],
    images: [
      'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&q=80',
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80'
    ],
    isApproved: true
  },
  {
    title: 'Contemporary Office Space in DIFC',
    description: 'Professional office space in the prestigious Dubai International Financial Centre. Fully fitted with modern amenities and meeting rooms.',
    price: 120000,
    currency: 'AED',
    type: 'office',
    listingType: 'rent',
    status: 'available',
    location: {
      city: 'Dubai',
      district: 'DIFC',
      street: 'Sheikh Zayed Road'
    },
    area: 200,
    bedrooms: 0,
    bathrooms: 2,
    features: ['Fiber Optic', 'Meeting Rooms', 'Reception', '24/7 Access'],
    images: [
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&q=80'
    ],
    isApproved: true
  },
  {
    title: 'Charming Family House with Backyard',
    description: 'Perfect family home located in a quiet suburban neighborhood. Close to top-rated schools and parks. Large backyard for kids and pets.',
    price: 450000,
    currency: 'GBP',
    type: 'house',
    listingType: 'sale',
    status: 'available',
    location: {
      city: 'London',
      district: 'Richmond',
      street: 'Kew Road'
    },
    area: 180,
    bedrooms: 3,
    bathrooms: 2,
    features: ['Fireplace', 'Parking', 'Schools Nearby', 'Garden'],
    images: [
      'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800&q=80',
      'https://images.unsplash.com/photo-1449156001437-3a16d1daaa39?w=800&q=80'
    ],
    isApproved: true
  },
  {
    title: 'Retail Shop in High-Traffic Area',
    description: 'Excellent retail opportunity in a busy commercial district. Large display windows and high visibility from the main street.',
    price: 5000,
    currency: 'EGP',
    type: 'shop',
    listingType: 'rent',
    status: 'available',
    location: {
      city: 'Cairo',
      district: 'Maadi',
      street: 'Road 9'
    },
    area: 80,
    bedrooms: 0,
    bathrooms: 1,
    features: ['Store Room', 'AC', 'Security Shutters'],
    images: [
      'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=800&q=80',
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80'
    ],
    isApproved: true
  }
];

async function seed() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/luxe_estates';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Resolve owner
    let owner = await User.findOne({ email: SEED_OWNER_EMAIL });
    if (!owner) {
      owner = await User.create({
        name: 'Luxe Estates Owner',
        email: SEED_OWNER_EMAIL,
        password: 'LuxeOwner@2025!',
        role: 'owner',
        isVerified: true,
        isActive: true
      });
      console.log(`✅ Owner created: ${owner._id}`);
    } else {
      console.log(`✅ Owner found: ${owner._id}`);
    }

    // Insert test properties
    const propertiesToInsert = TEST_PROPERTIES.map(p => ({ ...p, owner: owner._id }));
    const result = await Property.insertMany(propertiesToInsert);
    console.log(`✅ Successfully seeded ${result.length} test properties!`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding test data:', error.message);
    if (error.errors) {
      Object.keys(error.errors).forEach(key => {
        console.error(`   - ${key}: ${error.errors[key].message}`);
      });
    }
    process.exit(1);
  }
}

seed();
