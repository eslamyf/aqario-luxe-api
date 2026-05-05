const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const path = require('path');

// Models
const User = require('../models/user.model');
const Property = require('../models/property.model');
const Booking = require('../models/booking.model');
const Payment = require('../models/payment.model');
const Review = require('../models/review.model');
const Favorite = require('../models/favorite.model');
const AuditLog = require('../models/auditLog.model');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const DB = process.env.MONGO_URI;

// Helper to get random item from array
const random = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const seedData = async () => {
  try {
    console.log('🚀 Starting MASS Seeding Process...');
    await mongoose.connect(DB);
    console.log('✅ DB connection successful!');

    // 1. Clear existing data
    console.log('🧹 Cleaning existing test data...');
    await Promise.all([
      User.deleteMany({ role: { $ne: 'admin' } }),
      Property.deleteMany({}),
      Booking.deleteMany({}),
      Payment.deleteMany({}),
      Review.deleteMany({}),
      Favorite.deleteMany({}),
      AuditLog.deleteMany({})
    ]);

    const password = await bcrypt.hash('password123', 12);

    // 2. Data Pools
    const names = ['Ahmed', 'Mohamed', 'Sarah', 'John', 'Emma', 'Omar', 'Laila', 'Youssef', 'Noura', 'Khalid', 'Hala', 'Zaid', 'Mona', 'Tarek', 'Dina'];
    const surnames = ['Salem', 'Hassan', 'Ali', 'Doe', 'Smith', 'Hussien', 'Abdelrahman', 'Mansour', 'Zaki', 'Bakr'];
    const cities = ['Cairo', 'Giza', 'Alexandria', 'North Coast', 'Hurghada', 'Sharm El Sheikh'];
    const districts = ['Maadi', 'Fifth Settlement', 'Sheikh Zayed', 'Zamalak', 'Heliopolis', 'Dokki', 'Agouza', 'Nasr City'];
    const propertyTypes = ['apartment', 'villa', 'house', 'studio', 'office'];
    const kycStatuses = ['approved', 'pending', 'not_submitted', 'rejected'];

    // 3. Create Users (50 users)
    console.log('👥 Generating 50 users...');
    const userDocs = [];
    for (let i = 0; i < 50; i++) {
      const role = i < 10 ? 'owner' : (i < 20 ? 'agent' : 'buyer');
      const kycStatus = random(kycStatuses);
      userDocs.push({
        name: `${random(names)} ${random(surnames)}`,
        email: `user${i}@example.com`,
        password,
        role,
        kycStatus,
        isVerified: kycStatus === 'approved',
        isActive: true
      });
    }
    const createdUsers = await User.create(userDocs);
    const owners = createdUsers.filter(u => u.role === 'owner' || u.role === 'agent');
    const buyers = createdUsers.filter(u => u.role === 'buyer');

    // 4. Create Properties (100 properties)
    console.log('🏠 Generating 100 properties...');
    const propertyDocs = [];
    for (let i = 0; i < 100; i++) {
      const type = random(propertyTypes);
      const city = random(cities);
      const district = random(districts);
      const price = randomInt(1000000, 20000000);
      propertyDocs.push({
        title: `Premium ${type} in ${district}, ${city} - Unit ${i}`,
        description: `This is a high-end ${type} located in the heart of ${district}. Features modern architecture, premium finishing, and close proximity to key services. Ideal for luxury living or investment.`,
        type,
        price,
        currency: 'EGP',
        location: { city, district, street: `Street ${randomInt(1, 100)}` },
        area: randomInt(100, 600),
        bedrooms: randomInt(1, 6),
        bathrooms: randomInt(1, 4),
        images: [`https://picsum.photos/seed/${i}/800/600`],
        owner: random(owners)._id,
        isApproved: i % 10 !== 0, // 90% approved
        status: 'available'
      });
    }
    const createdProperties = await Property.create(propertyDocs);
    const approvedProperties = createdProperties.filter(p => p.isApproved);

    // 5. Create Bookings & Payments (150 bookings)
    console.log('📅 Generating 150 bookings & payments...');
    const bookingDocs = [];
    for (let i = 0; i < 150; i++) {
      const prop = random(approvedProperties);
      const buyer = random(buyers);
      const status = random(['pending', 'approved', 'rejected', 'cancelled']);
      const daysAhead = randomInt(1, 30);
      bookingDocs.push({
        user_id: buyer._id,
        property_id: prop._id,
        start_date: new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000),
        end_date: new Date(Date.now() + (daysAhead + 7) * 24 * 60 * 60 * 1000),
        amount: prop.price * 0.01,
        status,
        paymentStatus: status === 'approved' ? 'paid' : (status === 'pending' ? 'pending' : 'not_initiated')
      });
    }
    const createdBookings = await Booking.create(bookingDocs);

    // 6. Create Payments
    console.log('💳 Generating payments...');
    const paymentDocs = [];
    createdBookings.forEach(b => {
      if (b.paymentStatus === 'paid') {
        const prop = createdProperties.find(p => p._id.toString() === b.property_id.toString());
        paymentDocs.push({
          user: b.user_id,
          property: b.property_id,
          booking: b._id,
          propertyPrice: prop.price,
          platformFee: prop.price * 0.025,
          netAmount: prop.price,
          totalAmount: prop.price * 1.025,
          status: 'paid',
          paymentMethod: random(['paypal', 'paymob', 'bank_transfer', 'cash']),
          transactionId: 'TXN_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
          isVerified: true,
          verifiedAt: new Date()
        });
      }
    });
    await Payment.create(paymentDocs);

    // 7. Create Reviews (Ensuring uniqueness)
    console.log('⭐ Generating reviews...');
    const reviewDocs = [];
    const reviewTrack = new Set();
    
    for (let i = 0; i < 300; i++) {
      const prop = random(approvedProperties);
      const buyer = random(buyers);
      const trackKey = `${prop._id}-${buyer._id}`;
      
      if (!reviewTrack.has(trackKey)) {
        reviewDocs.push({
          userId: buyer._id,
          propertyId: prop._id,
          rating: randomInt(3, 5),
          comment: random(['Amazing place!', 'Very comfortable.', 'Great location.', 'Worth the price.', 'Clean and quiet.', 'Excellent service.', 'Beautiful design.']),
        });
        reviewTrack.add(trackKey);
      }
    }
    await Review.create(reviewDocs);

    // 8. Create Audit Logs (300 logs)
    console.log('🗒️ Generating 300 audit logs...');
    const auditDocs = [];
    const actions = ['APPROVE_PROPERTY', 'REJECT_PROPERTY', 'BAN_USER', 'APPROVE_KYC', 'CHANGE_ROLE'];
    const adminId = createdUsers.find(u => u.role === 'admin')?._id || createdUsers[0]._id;
    for (let i = 0; i < 300; i++) {
      const action = random(actions);
      let targetType = 'Property';
      let targetId = random(createdProperties)._id;
      
      if (action.includes('USER') || action.includes('KYC') || action.includes('ROLE')) {
        targetType = 'User';
        targetId = random(createdUsers)._id;
      }

      auditDocs.push({
        actor: adminId,
        action,
        targetType,
        targetId,
        changes: { before: { status: 'old' }, after: { status: 'new' } },
        metadata: { ip: '127.0.0.1', userAgent: 'Mozilla/5.0' }
      });
    }
    await AuditLog.create(auditDocs);

    console.log('✅ MASS SEEDING COMPLETED! 🚀');
    console.log('Summary:');
    console.log(`- Users: ${createdUsers.length}`);
    console.log(`- Properties: ${createdProperties.length}`);
    console.log(`- Bookings: ${createdBookings.length}`);
    console.log(`- Payments: ${paymentDocs.length}`);
    console.log(`- Reviews: ${reviewDocs.length}`);
    console.log(`- Audit Logs: 300`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding data:', err);
    process.exit(1);
  }
};

seedData();
