const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const User = require(path.join(__dirname, 'src/models/user.model'));

const check = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB...\n');
    
    const admin = await User.findOne({ email: 'admin@luxe.com' }).select('+password');
    if (admin) {
      console.log('✅ ADMIN ACCOUNT FOUND:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 Email:', admin.email);
      console.log('👤 Name:', admin.name);
      console.log('🔐 Role:', admin.role);
      console.log('✔️ Verified:', admin.isVerified);
      console.log('✔️ Active:', admin.isActive);
      console.log('🔑 Password Hash exists:', !!admin.password);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n✅ Admin account is properly configured in database');
    } else {
      console.log('❌ Admin not found - creating new one...');
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('Admin123!@#', 12);
      
      const newAdmin = await User.create({
        name: 'Super Admin',
        email: 'admin@luxe.com',
        password: 'Admin123!@#',
        role: 'admin',
        isVerified: true,
        isActive: true
      });
      
      console.log('✅ Admin created successfully');
      console.log('📧 Email: admin@luxe.com');
      console.log('🔑 Password: Admin123!@#');
    }
    
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
};

check();
