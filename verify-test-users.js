const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/user.model');

dotenv.config();

const verifyUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('DB Connected');

    const emails = ['ahmed.kyc@example.com', 'sarah.owner@example.com', 'ziad.agent@example.com', 'omar@example.com'];
    
    const result = await User.updateMany(
      { email: { $in: emails } },
      { $set: { isVerified: true, kycStatus: 'not_submitted' } } // Set to not_submitted so the user can test the process
    );

    console.log(`Updated ${result.modifiedCount} test users to verified status.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

verifyUsers();
