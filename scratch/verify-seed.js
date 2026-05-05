const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/user.model');
const Property = require('../src/models/property.model');
const Booking = require('../src/models/booking.model');

const MONGO_URI = process.env.MONGO_URI;

async function check() {
    await mongoose.connect(MONGO_URI);
    const user = await User.findOne({ email: 'dashboard-test@luxe.com' });
    console.log('User found:', user?.name, 'Role:', user?.role);
    
    const props = await Property.find({ owner: user._id });
    console.log('Properties count:', props.length);
    
    const bookings = await Booking.find({ property_id: { $in: props.map(p => p._id) } });
    console.log('Bookings on properties:', bookings.length);

    process.exit(0);
}
check();
