const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const Property = require(path.join(__dirname, '../models/property.model'));

const seedProperties = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/aqario_luxe');
    console.log('⏳ Clearing old properties and adding new ones...');

    await Property.deleteMany({});

    const properties = [
      {
        title: 'Luxury Nile Villa Qena',
        description: 'A premium villa with a private pool and direct Nile view for high-end residency.',
        price: 5000,
        type: 'villa', // مطابقة للـ Enum في الموديل
        listingType: 'rent', // مهمة جداً عشان تظهر فورم الحجز
        location: {
          city: 'Qena',
          district: 'Corniche',
          street: 'Nile St.'
        },
        owner: '69f21e67e7e2a05efc53cf4e', // الـ ID بتاعك من اللوجن
        isApproved: true, // عشان تظهر في البحث
        status: 'available',
        images: ['https://res.cloudinary.com/demo/image/upload/v1631533327/sample.jpg'],
        area: 450
      },
      {
        title: 'Modern Student Apartment',
        description: 'Perfectly located apartment near South Valley University with all facilities.',
        price: 1500,
        type: 'apartment',
        listingType: 'rent',
        location: {
          city: 'Qena',
          district: 'University St.',
          street: 'Main Road'
        },
        owner: '69f21e67e7e2a05efc53cf4e',
        isApproved: true,
        status: 'available',
        images: ['https://res.cloudinary.com/demo/image/upload/v1631533327/sample.jpg'],
        area: 120
      }
    ];

    await Property.insertMany(properties);
    console.log('✅ 2 Properties added and Approved!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Property Seed Error:', error.message);
    process.exit(1);
  }
};
seedProperties();