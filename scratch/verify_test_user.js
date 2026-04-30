const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../src/models/user.model');

async function verifyUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const email = 'buyer_test@gmail.com';
    const user = await User.findOneAndUpdate({ email }, { isVerified: true }, { new: true });
    if (user) {
      console.log(`✅ User ${email} verified successfully!`);
    } else {
      console.log(`❌ User ${email} not found.`);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
verifyUser();
