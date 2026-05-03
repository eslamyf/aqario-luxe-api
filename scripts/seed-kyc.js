const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');
const User = require('../src/models/user.model');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI;

const mockKycData = [
  { name: 'Ahmed Buyer', email: 'ahmed.kyc@example.com', role: 'buyer', status: 'pending', type: 'national_id', img: 'https://images.unsplash.com/photo-1554774853-719586f82d77?w=800' },
  { name: 'Sarah Owner', email: 'sarah.owner@example.com', role: 'owner', status: 'pending', type: 'passport', img: 'https://images.unsplash.com/photo-1544027993-37dbfe43562a?w=800' },
  { name: 'Ziad Agent', email: 'ziad.agent@example.com', role: 'agent', status: 'pending', type: 'drivers_license', img: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=800' },
  { name: 'Omar Mansour', email: 'omar@example.com', role: 'buyer', status: 'pending', type: 'national_id', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800' },
  { name: 'Layla Hassan', email: 'layla@example.com', role: 'owner', status: 'approved', type: 'passport', img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800' },
  { name: 'Noah Smith', email: 'noah@example.com', role: 'agent', status: 'rejected', type: 'national_id', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800', reason: 'Documents are blurred and unreadable.' },
  { name: 'Isabella Rossi', email: 'isabella@example.com', role: 'buyer', status: 'pending', type: 'passport', img: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=800' },
  { name: 'Youssef Ali', email: 'youssef@example.com', role: 'owner', status: 'pending', type: 'national_id', img: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=800' },
  { name: 'Sophia Chen', email: 'sophia@example.com', role: 'buyer', status: 'approved', type: 'drivers_license', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800' },
  { name: 'Liam Wilson', email: 'liam@example.com', role: 'agent', status: 'pending', type: 'passport', img: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800' },
  { name: 'Fatima Zahra', email: 'fatima@example.com', role: 'owner', status: 'pending', type: 'national_id', img: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=800' },
  { name: 'Lucas Meyer', email: 'lucas@example.com', role: 'buyer', status: 'rejected', type: 'passport', img: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800', reason: 'Expiry date on passport has passed.' },
  { name: 'Emma Watson', email: 'emma.w@example.com', role: 'owner', status: 'pending', type: 'drivers_license', img: 'https://images.unsplash.com/photo-1548142813-c348350df52b?w=800' },
  { name: 'Mohammed Khan', email: 'mohammed.k@example.com', role: 'agent', status: 'approved', type: 'national_id', img: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=800' },
  { name: 'Chloe Dubois', email: 'chloe@example.com', role: 'buyer', status: 'pending', type: 'passport', img: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=800' }
];

async function seedKYC() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to Atlas.');

    const hashedPassword = await bcrypt.hash('Password123!', 12);

    for (const data of mockKycData) {
      console.log(`Syncing user: ${data.email}...`);
      
      await User.findOneAndUpdate(
        { email: data.email },
        { 
          $set: {
            name: data.name,
            password: hashedPassword,
            role: data.role,
            kycStatus: data.status,
            kycRejectionReason: data.reason || '',
            kycDocuments: [{
              type: data.type,
              frontImage: data.img,
              uploadedAt: new Date()
            }],
            kycSubmittedAt: new Date(),
            isActive: true,
            isVerified: data.status === 'approved',
            authProvider: 'local'
          }
        },
        { upsert: true, new: true }
      );
    }

    console.log('✅ KYC Seeding Complete!');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

seedKYC();
