const mongoose = require('mongoose');
const Property = require('../models/property.model');
require('dotenv').config();

const seedProperties = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/aqario_luxe');
    console.log('⏳ Seeding properties with correct validation...');

    await Property.deleteMany({});

    const properties = [
      {
        title: 'Luxury Villa with Nile View',
        description: 'A stunning villa located in the heart of Qena with a direct view of the Nile.',
        price: 5000,
        // التعديل هنا: الـ location بقى object فيه الحقول المطلوبة
        location: {
          city: 'Qena',
          district: 'Nile Corniche',
          address: 'Street 15, Nile View'
        },
        // التعديل هنا: جرب 'for-rent' لأنها الشائعة في الـ Enums بتاعتك
        type: 'for-rent', 
        category: 'villa',
        owner: '69f21e67e7e2a05efc53cf4e', // الـ ID بتاعك
        images: ['https://res.cloudinary.com/demo/image/upload/v1631533327/sample.jpg'],
        features: ['Wifi', 'Pool', 'Air Conditioning'],
        isAvailable: true
      },
      {
        title: 'Modern Apartment Near University',
        description: 'Perfect for students and professionals. Fully furnished.',
        price: 1200,
        location: {
          city: 'Qena',
          district: 'South Valley',
          address: 'University District'
        },
        type: 'for-rent',
        category: 'apartment',
        owner: '69f21e67e7e2a05efc53cf4e',
        images: ['https://res.cloudinary.com/demo/image/upload/v1631533327/sample.jpg'],
        features: ['Elevator', 'Kitchen', 'Balcony'],
        isAvailable: true
      }
    ];

    await Property.insertMany(properties);
    console.log('✅ 2 Properties added successfully with full validation!');
    process.exit();
  } catch (error) {
    console.error('❌ Error seeding properties:', error.message);
    process.exit(1);
  }
};

seedProperties();