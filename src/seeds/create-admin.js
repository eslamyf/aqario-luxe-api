const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Load User Model
const User = require(path.join(__dirname, '../models/user.model'));

const createAdmin = async () => {
  try {
    // 1. Connect to DB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/luxe_estates';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // 2. Admin Data
    const adminData = {
      name: 'Super Admin',
      email: 'admin@luxe.com',
      password: 'Admin@123456',
      role: 'admin',
      isVerified: true,
      isActive: true
    };

    // 3. Check if admin exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    if (existingAdmin) {
      console.log('⚠️ Admin already exists with this email.');
      process.exit(0);
    }

    // 4. Create Admin
    // Note: If your model hashes the password in a pre-save hook, 
    // we don't need to hash it here. Most of our models do.
    const newAdmin = await User.create(adminData);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ADMIN ACCOUNT CREATED SUCCESSFULLY');
    console.log(`📧 Email:    ${newAdmin.email}`);
    console.log(`🔑 Password:  Admin@123456`);
    console.log(`🆔 ID:        ${newAdmin._id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
};

createAdmin();
