const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Load User Model
const User = require(path.join(__dirname, '../models/user.model'));

const resetAdminPassword = async () => {
  try {
    // 1. Connect to DB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/aqario_luxe';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // 2. Admin credentials
    const adminEmail = 'admin@aqario-luxe.com';
    const newPassword = 'Admin123!@#';

    // 3. Find existing admin
    let admin = await User.findOne({ email: adminEmail });
    
    if (!admin) {
      console.log('⚠️ Admin account not found. Creating new admin...');
      
      // Create new admin
      admin = await User.create({
        name: 'Super Admin',
        email: adminEmail,
        password: newPassword,
        role: 'admin',
        isVerified: true,
        isActive: true
      });
      
      console.log('✅ New admin account created');
    } else {
      console.log('✅ Existing admin account found. Updating password...');
      
      // Update password and ensure account is active
      admin.password = newPassword;
      admin.isVerified = true;
      admin.isActive = true;
      admin.role = 'admin';
      admin.loginAttempts = 0;
      admin.lockUntil = undefined;
      
      await admin.save();
      
      console.log('✅ Admin account updated');
    }
    
    // 4. Display admin credentials
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ADMIN ACCOUNT READY');
    console.log(`📧 Email:    ${admin.email}`);
    console.log(`🔑 Password: ${newPassword}`);
    console.log(`🆔 ID:       ${admin._id}`);
    console.log(`👤 Role:     ${admin.role}`);
    console.log(`✔️ Verified: ${admin.isVerified}`);
    console.log(`✔️ Active:   ${admin.isActive}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

resetAdminPassword();
