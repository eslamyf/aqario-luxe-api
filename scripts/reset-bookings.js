const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Booking = require('../src/models/booking.model');
const Payment = require('../src/models/payment.model');

const userIds = [
  "69f544a46304dccc91e56c2f", "69f544a46304dccc91e56c30", 
  "69f544a46304dccc91e56c31", "69f544a46304dccc91e56c32", 
  "69f544a46304dccc91e56c33"
];

const propIds = [
  "69f544a66304dccc91e56c66", "69f544a66304dccc91e56c67", 
  "69f544a66304dccc91e56c68", "69f544a66304dccc91e56c69", 
  "69f544a66304dccc91e56c6a"
];

const statuses = ['pending', 'approved', 'rejected', 'cancelled'];
const payStatuses = ['paid', 'pending', 'not_initiated', 'refunded'];
const paymentMethods = ['cash', 'bank_transfer', 'paypal', 'paymob'];

async function resetAndSeed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to Atlas...');

    // 1. Clean up ALL bookings and payments
    await Booking.deleteMany({});
    await Payment.deleteMany({});
    console.log('Database cleaned (all bookings and payments removed).');

    // 2. Create exactly 40 bookings
    const bookingsToCreate = 40;
    const newBookings = [];

    for (let i = 0; i < bookingsToCreate; i++) {
      const userId = userIds[Math.floor(Math.random() * userIds.length)];
      const propId = propIds[Math.floor(Math.random() * propIds.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const propertyPrice = Math.floor(Math.random() * 50000) + 5000;
      const platformFee = Math.floor(propertyPrice * 0.025);
      const totalAmount = propertyPrice + platformFee;
      
      const start = new Date();
      start.setDate(start.getDate() + Math.floor(Math.random() * 30));
      const end = new Date(start);
      end.setDate(end.getDate() + Math.floor(Math.random() * 10) + 2);

      const booking = new Booking({
        user_id: userId,
        property_id: propId,
        amount: propertyPrice,
        start_date: start,
        end_date: end,
        status: status,
        paymentStatus: payStatuses[Math.floor(Math.random() * payStatuses.length)],
        isPriority: propertyPrice > 30000,
        created_at: new Date(Date.now() - (i * 3600000)) // Sequential creation for predictable ordering
      });

      newBookings.push(booking);
    }

    const savedBookings = await Booking.insertMany(newBookings);
    console.log(`Created exactly ${savedBookings.length} bookings.`);

    const newPayments = savedBookings.map(b => {
      const propertyPrice = b.amount;
      const platformFee = Math.floor(propertyPrice * 0.025);
      const totalAmount = propertyPrice + platformFee;
      
      return {
        user: b.user_id,
        property: b.property_id,
        booking: b._id,
        propertyPrice: propertyPrice,
        platformFee: platformFee,
        netAmount: propertyPrice,
        totalAmount: totalAmount,
        currency: 'EGP',
        paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
        status: b.paymentStatus === 'paid' ? 'paid' : (b.paymentStatus === 'refunded' ? 'refunded' : 'pending'),
        isVerified: b.paymentStatus === 'paid',
        createdAt: b.created_at
      };
    });

    await Payment.insertMany(newPayments);
    console.log(`Created ${newPayments.length} payments.`);

    console.log('Reset and seed completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Operation failed:', err);
    process.exit(1);
  }
}

resetAndSeed();
