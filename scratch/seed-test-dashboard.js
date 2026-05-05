const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/user.model');
const Property = require('../src/models/property.model');
const Booking = require('../src/models/booking.model');
const Subscription = require('../src/models/subscription.model');
const ViewingRequest = require('../src/models/viewingRequest.model');
const Favorite = require('../src/models/favorite.model');
const Payment = require('../src/models/payment.model');

const MONGO_URI = process.env.MONGO_URI;

const seed = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to Atlas Cluster...');

    // 1. Create/Find Test User
    let testUser = await User.findOne({ email: 'dashboard-test@luxe.com' });
    if (!testUser) {
      testUser = await User.create({
        name: 'Dashboard Tester',
        email: 'dashboard-test@luxe.com',
        password: 'password123',
        role: 'owner',
        kycStatus: 'approved',
        isVerified: true,
        subscriptionStatus: 'active',
      });
      console.log('Created Test User:', testUser.email);
    } else {
      testUser.role = 'owner';
      testUser.kycStatus = 'approved';
      testUser.subscriptionStatus = 'active';
      await testUser.save();
      console.log('Updated Test User:', testUser.email);
    }

    // 2. Clear previous test data for this user
    await Promise.all([
      Property.deleteMany({ owner: testUser._id }),
      Booking.deleteMany({ user_id: testUser._id }),
      ViewingRequest.deleteMany({ requester: testUser._id }),
      Favorite.deleteMany({ user_id: testUser._id }),
      Subscription.deleteMany({ user: testUser._id }),
    ]);

    // 3. Create Properties
    const properties = await Property.insertMany([
      {
        title: 'Modern Penthouse with Stunning Nile View',
        description: 'Luxurious penthouse in Zamalek with a panoramic view of the Nile River. Fully furnished and recently renovated.',
        price: 15000000,
        area: 350,
        bedrooms: 4,
        bathrooms: 3,
        type: 'apartment',
        status: 'available',
        isApproved: true,
        owner: testUser._id,
        location: { city: 'Cairo', district: 'Zamalek', street: '26th of July St' },
        images: ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750']
      },
      {
        title: 'Boutique Luxury Villa in New Cairo',
        description: 'Private pool and garden in a premium gated community. Modern architecture and high-end finishes throughout.',
        price: 25000000,
        area: 600,
        bedrooms: 6,
        bathrooms: 5,
        type: 'villa',
        status: 'available',
        isApproved: true,
        owner: testUser._id,
        location: { city: 'Cairo', district: 'New Cairo', street: '90th North St' },
        images: ['https://images.unsplash.com/photo-1613490493576-7fde63acd811']
      },
      {
        title: 'Cozy Modern Studio in Maadi Degla',
        description: 'Green view, quiet street. Perfect for a single professional or a couple. Close to all major amenities.',
        price: 3000000,
        area: 90,
        bedrooms: 1,
        bathrooms: 1,
        type: 'apartment',
        status: 'available',
        isApproved: true,
        owner: testUser._id,
        location: { city: 'Cairo', district: 'Maadi', street: 'Road 9' },
        images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267']
      },
      {
        title: 'Exclusive Luxury Suite Pending Approval',
        description: 'Waiting for admin approval. High-end apartment in the heart of October City with premium facilities.',
        price: 8000000,
        area: 200,
        bedrooms: 2,
        bathrooms: 2,
        type: 'apartment',
        status: 'available',
        isApproved: false,
        owner: testUser._id,
        location: { city: 'Giza', district: '6th of October', street: 'Mehwar St' },
      }
    ]);
    console.log('Created 4 Properties');

    // 4. Create an Active Subscription
    const sub = await Subscription.create({
      user: testUser._id,
      plan: 'pro',
      status: 'active',
      price: 199,
      maxListings: 10,
      listingsUsedThisMonth: 3,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isAutoRenew: true
    });
    testUser.activeSubscription = sub._id;
    await testUser.save();
    console.log('Created Active Subscription and linked to user');

    // 5. Create some bookings for his properties (from other users)
    const otherUser = await User.findOne({ _id: { $ne: testUser._id } });
    if (otherUser) {
        await Booking.insertMany([
            {
                user_id: otherUser._id,
                property_id: properties[0]._id,
                start_date: new Date(Date.now() + 86400000),
                end_date: new Date(Date.now() + 86400000 * 3),
                amount: 15000,
                status: 'pending'
            },
            {
                user_id: otherUser._id,
                property_id: properties[1]._id,
                start_date: new Date(Date.now() + 86400000 * 10),
                end_date: new Date(Date.now() + 86400000 * 15),
                amount: 50000,
                status: 'approved'
            }
        ]);
        console.log('Created 2 Bookings on Owner Properties');
    }

    // 6. Create some personal bookings (Owner as a buyer)
    const otherProperty = await Property.findOne({ owner: { $ne: testUser._id } });
    if (otherProperty) {
        await Booking.create({
            user_id: testUser._id,
            property_id: otherProperty._id,
            start_date: new Date(Date.now() + 86400000 * 5),
            end_date: new Date(Date.now() + 86400000 * 7),
            amount: 10000,
            status: 'approved'
        });
        console.log('Created Personal Booking');
    }

    // 7. Create Viewing Requests
    await ViewingRequest.create({
        requester: testUser._id,
        property: properties[0]._id, 
        owner: properties[0].owner,
        status: 'pending',
        preferredDate: new Date(),
        preferredTime: 'morning'
    });

    console.log('SUCCESS: Test Data Seeded for User Dashboard');
    console.log('Login Email: dashboard-test@luxe.com');
    console.log('Password: password123');
    
    process.exit(0);
  } catch (err) {
    console.error('SEED ERROR:', err);
    process.exit(1);
  }
};

seed();
