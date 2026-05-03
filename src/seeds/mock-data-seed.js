const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

// Load environment variables
dotenv.config({ path: './.env' });

// Models
const User = require('../models/user.model');
const Property = require('../models/property.model');
const Booking = require('../models/booking.model');
const Payment = require('../models/payment.model');
const Review = require('../models/review.model');
const Favorite = require('../models/favorite.model');
const PropertyView = require('../models/propertyView.model');
const Inquiry = require('../models/inquiry.model');
const Notification = require('../models/notification.model');
const Report = require('../models/report.model');

// --- Helper Functions for Random Data ---
function getRandomDate(startYear, startMonth, endYear, endMonth) {
  const start = new Date(startYear, startMonth, 1);
  const end = new Date(endYear, endMonth, 28);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const FIRST_NAMES = ['James', 'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'William', 'Sophia', 'Lucas', 'Isabella', 'Mohammed', 'Aisha', 'Omar', 'Fatima', 'Youssef'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Al-Fayed', 'Mansour', 'Hassan', 'Ali'];

const PROPERTY_TITLES = ['Luxury Penthouse', 'Beachfront Villa', 'Modern Studio', 'Sky-high Apartment', 'Royal Estate', 'Desert Oasis Mansion', 'Urban Loft', 'Panoramic Suite', 'Grand Palace', 'Sapphire Residence'];
const CITIES = ['Dubai', 'New York', 'London', 'Paris', 'Tokyo', 'Miami', 'Los Angeles', 'Monaco', 'Singapore', 'Riyadh'];
const DISTRICTS = ['Downtown', 'Marina', 'Jumeirah', 'Manhattan', 'Mayfair', 'Beverly Hills', 'South Beach', 'Shinjuku', 'Diplomatic Quarter'];
const FEATURES = ['Pool', 'Gym', 'Smart Home', 'Private Beach', 'Helipad', 'Cinema', 'Wine Cellar', 'Tennis Court', 'Spa', 'Concierge'];

async function seedData() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected successfully!');

    console.log('🗑️ Clearing existing data...');
    await Promise.all([
      User.deleteMany(), Property.deleteMany(), Booking.deleteMany(),
      Payment.deleteMany(), Review.deleteMany(), Favorite.deleteMany(),
      PropertyView.deleteMany(), Inquiry.deleteMany(), Notification.deleteMany(),
      Report.deleteMany()
    ]);

    console.log('⏳ Seeding 50 Users...');
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash('password123', salt);

    const usersToCreate = [
      { name: 'Luxe Admin', email: 'admin@luxe-estates.com', password: hashedPassword, authProvider: 'local', role: 'admin', isVerified: true },
      { name: 'Elite Owner', email: 'owner@luxe-estates.com', password: hashedPassword, authProvider: 'local', role: 'owner', isVerified: true }
    ];

    for (let i = 0; i < 48; i++) {
      usersToCreate.push({
        name: `${getRandomItem(FIRST_NAMES)} ${getRandomItem(LAST_NAMES)}`,
        email: `user${i}@example.com`,
        password: hashedPassword,
        authProvider: 'local',
        role: Math.random() > 0.8 ? 'owner' : 'buyer',
        isVerified: Math.random() > 0.2,
        kycStatus: Math.random() > 0.5 ? 'approved' : 'pending',
        createdAt: getRandomDate(2025, 0, 2026, 4)
      });
    }

    const insertedUsers = await User.insertMany(usersToCreate);
    const owners = insertedUsers.filter(u => u.role === 'owner' || u.role === 'admin');
    const buyers = insertedUsers.filter(u => u.role === 'buyer');
    const allUsers = insertedUsers;

    console.log('⏳ Seeding 100 Properties...');
    const propertiesToCreate = [];
    for (let i = 0; i < 100; i++) {
      const type = getRandomItem(['apartment', 'villa', 'house', 'studio', 'commercial']);
      const listingType = Math.random() > 0.6 ? 'rent' : 'sale';
      const basePrice = listingType === 'rent' ? getRandomInt(1000, 20000) : getRandomInt(500000, 20000000);

      const randomFeatures = [];
      for (let f = 0; f < getRandomInt(2, 6); f++) { randomFeatures.push(getRandomItem(FEATURES)); }

      propertiesToCreate.push({
        title: `${getRandomItem(PROPERTY_TITLES)} in ${getRandomItem(CITIES)}`,
        description: 'A spectacular property boasting stunning views, high-end finishing, and unparalleled luxury in the heart of the city.',
        price: basePrice,
        currency: 'USD',
        type: type,
        listingType: listingType,
        status: Math.random() > 0.8 ? 'sold' : 'available',
        location: { city: getRandomItem(CITIES), district: getRandomItem(DISTRICTS), street: `Street ${getRandomInt(1, 100)}` },
        area: getRandomInt(500, 15000),
        bedrooms: getRandomInt(1, 8),
        bathrooms: getRandomInt(1, 10),
        images: [
          `https://images.unsplash.com/photo-${getRandomInt(1400000000000, 1600000000000)}?auto=format&fit=crop&w=1200&q=80`,
          `https://images.unsplash.com/photo-${getRandomInt(1400000000000, 1600000000000)}?auto=format&fit=crop&w=1200&q=80`
        ],
        features: [...new Set(randomFeatures)],
        owner: getRandomItem(owners)._id,
        isApproved: Math.random() > 0.1,
        createdAt: getRandomDate(2025, 0, 2026, 4),
        avgRating: 0,
        reviewCount: 0
      });
    }

    const insertedProperties = await Property.insertMany(propertiesToCreate);

    console.log('⏳ Seeding Bookings, Payments, Reviews, Favorites, Views, Inquiries, Notifications...');

    const bookingsData = [];
    const paymentsData = [];
    const reviewsData = [];
    const favoritesData = [];
    const viewsData = [];
    const inquiriesData = [];
    const notificationsData = [];
    const reportsData = [];

    // Loop to create interconnected data
    for (let i = 0; i < 300; i++) {
      const buyer = getRandomItem(buyers);
      const property = getRandomItem(insertedProperties);
      const date = getRandomDate(2025, 3, 2026, 4);

      // 1. Bookings & Payments (300)
      const isApproved = Math.random() > 0.1;
      const isPaid = isApproved && Math.random() > 0.1;
      const startDate = new Date(date.getTime() + getRandomInt(1, 30) * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + getRandomInt(1, 14) * 24 * 60 * 60 * 1000);
      const bookingId = new mongoose.Types.ObjectId();
      const amount = property.listingType === 'rent' ? property.price * getRandomInt(1, 12) : property.price;

      bookingsData.push({
        _id: bookingId, user_id: buyer._id, property_id: property._id,
        amount, start_date: startDate, end_date: endDate,
        status: isApproved ? 'approved' : (Math.random() > 0.5 ? 'pending' : 'cancelled'),
        paymentStatus: isPaid ? 'paid' : 'pending',
        paidAmount: isPaid ? amount : 0, created_at: date
      });

      paymentsData.push({
        user: buyer._id, property: property._id, booking: bookingId,
        propertyPrice: amount, platformFee: amount * 0.025, netAmount: amount, totalAmount: amount * 1.025,
        paymentMethod: getRandomItem(['bank_transfer', 'paypal', 'paymob', 'cash']),
        status: isPaid ? 'paid' : (Math.random() > 0.7 ? 'failed' : 'pending'), createdAt: date
      });

      // 2. Reviews (approx 150)
      if (i % 2 === 0) {
        reviewsData.push({
          propertyId: property._id, userId: buyer._id,
          rating: getRandomInt(3, 5), comment: 'Amazing place! Highly recommended.',
          createdAt: date, updatedAt: date
        });
      }

      // 3. Favorites (approx 100)
      if (i % 3 === 0) {
        favoritesData.push({ user_id: buyer._id, property_id: property._id, created_at: date });
      }

      // 4. Inquiries (approx 100)
      if (i % 3 === 0) {
        inquiriesData.push({
          sender: buyer._id, receiver: property.owner, property: property._id,
          content: 'Hi, is this property still available for viewing?',
          isRead: Math.random() > 0.5,
          replies: Math.random() > 0.5 ? [{ from: property.owner, message: 'Yes, it is!', createdAt: new Date(date.getTime() + 86400000) }] : [],
          createdAt: date, updatedAt: date
        });
      }

      // 5. Notifications (approx 300)
      notificationsData.push({
        userId: buyer._id, type: 'system', title: 'Welcome to Luxe Estates',
        message: 'Your account has been successfully created.', isRead: Math.random() > 0.5, createdAt: date
      });
      notificationsData.push({
        userId: property.owner, type: 'booking', title: 'New Booking Request',
        message: `You have a new booking for ${property.title}.`, isRead: Math.random() > 0.5, createdAt: date
      });

      // 6. Reports (approx 15)
      if (i % 20 === 0) {
        reportsData.push({
          reportedBy: buyer._id, reportedItemType: 'property', reportedItemId: property._id,
          reason: 'misleading', description: 'The photos do not match reality.', status: 'pending', createdAt: date
        });
      }
    }

    // 7. Property Views Analytics (approx 1000)
    for (let i = 0; i < 1000; i++) {
      viewsData.push({
        property: getRandomItem(insertedProperties)._id,
        viewer: Math.random() > 0.3 ? getRandomItem(allUsers)._id : null,
        ip: '192.168.1.1', source: getRandomItem(['web', 'mobile', 'api']),
        viewedAt: getRandomDate(2025, 11, 2026, 4)
      });
    }

    // Insert all data using bulk inserts for speed
    await Booking.collection.insertMany(bookingsData);
    await Payment.collection.insertMany(paymentsData);

    // We use Model.insertMany for Reviews to trigger hooks that calculate avgRating!
    try { await Review.insertMany(reviewsData); } catch (e) { /* ignore duplicate key errors from loop overlap */ }

    try { await Favorite.collection.insertMany(favoritesData); } catch (e) { } // Ignore duplicate user+property

    await PropertyView.collection.insertMany(viewsData);
    await Inquiry.collection.insertMany(inquiriesData);
    await Notification.collection.insertMany(notificationsData);
    await Report.collection.insertMany(reportsData);

    console.log('✅ MASSIVE FULL DATABASE mock data seeded successfully!');
    console.log(`📊 Generated: 50 Users | 100 Properties | 300 Bookings/Payments | 1000 Views | 150 Reviews | 100 Inquiries | 600 Notifications`);
    console.log('--------------------------------------------------');
    console.log('Login Details:');
    console.log('Admin: admin@luxe-estates.com | Password: password123');
    console.log('Owner: owner@luxe-estates.com | Password: password123');
    console.log('--------------------------------------------------');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

seedData();
