const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./src/models/user.model');

dotenv.config();

async function checkKycData() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('--- Checking KYC Data ---');
    
    const totalPending = await User.countDocuments({ kycStatus: 'pending' });
    console.log(`Total Pending in DB: ${totalPending}`);

    const users = await User.find({ kycStatus: 'pending' }).select('name email kycStatus');
    console.log('Pending Users List:');
    users.forEach((u, i) => {
      console.log(`${i+1}. ${u.name} (${u.email}) - Status: ${u.kycStatus}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkKycData();
