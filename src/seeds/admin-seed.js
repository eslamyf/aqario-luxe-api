const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/user.model');

const seedAdmin = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/aqario_luxe';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const email = 'admin@luxe.com';
    const rawPassword = 'Admin123!@#';
    
    // Hash password manually to ensure it's hashed correctly for findOneAndUpdate/upsert
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    const adminData = {
      name: 'Master Admin',
      email,
      password: hashedPassword,
      role: 'admin',
      isVerified: true,
      isActive: true,
      kycStatus: 'approved',
      kycNationality: 'Egyptian',
      kycPhoneNumber: '+201234567890',
      kycLivePhoto: 'https://res.cloudinary.com/demo/image/upload/sample.jpg'
    };

    // Use findOneAndUpdate with upsert: true
    const admin = await User.findOneAndUpdate(
      { email },
      { $set: adminData },
      { returnDocument: 'after', upsert: true, runValidators: true }
    );

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ MASTER ADMIN ACCOUNT SEEDED SUCCESSFULLY');
    console.log(`📧 Email:    ${admin.email}`);
    console.log(`🔑 Password:  ${rawPassword}`);
    console.log(`🆔 ID:        ${admin._id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();