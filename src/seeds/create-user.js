const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/user.model');

const createUser = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/luxe_estates';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const userData = {
      name: 'Khalaf Hussien',
      email: 'khalafhussien8@gmail.com',
      password: 'User@123456',
      role: 'buyer',
      isVerified: true,
      isActive: true,
      kycStatus: 'approved' // Approved for testing
    };

    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      console.log('⚠️ User already exists with this email.');
      process.exit(0);
    }

    const newUser = await User.create(userData);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ USER ACCOUNT CREATED SUCCESSFULLY');
    console.log(`📧 Email:    ${newUser.email}`);
    console.log(`🔑 Password:  User@123456`);
    console.log(`🆔 ID:        ${newUser._id}`);
    console.log(`🎭 Role:      ${newUser.role}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    process.exit(1);
  }
};

createUser();
