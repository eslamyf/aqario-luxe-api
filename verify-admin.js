const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/user.model');

dotenv.config();

const verifyAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('DB Connected');

    const result = await User.updateMany(
      { role: 'admin', isVerified: false },
      { $set: { isVerified: true } }
    );

    console.log(`Updated ${result.modifiedCount} admin users to verified status.`);
    
    // Also verify specifically the one the user might be using if it's not role admin but they think it is
    // Or just verify everyone for development ease if the user wants
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

verifyAdmin();
