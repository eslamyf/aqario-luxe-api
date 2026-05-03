const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Property = require('../models/property.model');
const User     = require('../models/user.model');

const SEED_OWNER_EMAIL = 'owner@luxeestates.com';

const PROPERTIES = [
  { title: 'Sky Penthouse — Dubai Marina', description: 'Experience luxury living in this sprawling penthouse with panoramic sea views and private rooftop access.', price: 8500000, currency: 'AED', type: 'apartment', listingType: 'sale', status: 'available', location: { city: 'Dubai', district: 'Marina', street: 'JBR Walk' }, area: 450, bedrooms: 5, bathrooms: 6, features: ['Pool', 'Gym', 'Sea View'], images: ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200'], isApproved: true, featured: true },
  { title: 'Mayfair Garden Apartment', description: 'A classic London residence in Mayfair, featuring high ceilings and a private walled garden.', price: 3200000, currency: 'GBP', type: 'apartment', listingType: 'sale', status: 'available', location: { city: 'London', district: 'Mayfair', street: 'Park Lane' }, area: 180, bedrooms: 3, bathrooms: 2, features: ['Porter', 'Gym', 'Garden'], images: ['https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=1200'], isApproved: true, featured: false },
  { title: 'Manhattan Skyline Loft', description: 'Authentic industrial loft in Tribeca with oversized windows and views of the One World Trade Center.', price: 18000, currency: 'USD', type: 'apartment', listingType: 'rent', status: 'available', location: { city: 'New York', district: 'Tribeca', street: 'Hudson St' }, area: 220, bedrooms: 2, bathrooms: 2, features: ['Doorman', 'Rooftop', 'City View'], images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200'], isApproved: true, featured: false },
  { title: "Côte d'Azur Beachfront Villa", description: 'Stunning modern villa on the French Riviera with direct beach access and a heated infinity pool.', price: 12800000, currency: 'EUR', type: 'villa', listingType: 'sale', status: 'available', location: { city: 'Nice', district: 'Promenade', street: 'Bord de Mer' }, area: 800, bedrooms: 7, bathrooms: 8, features: ['Private Beach', 'Infinity Pool'], images: ['https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1200'], isApproved: true, featured: true },
  { title: 'Zamalek Historic Mansion', description: 'A rare jewel in Zamalek, this historic mansion offers unparalleled views of the Nile and a lush private garden.', price: 45000000, currency: 'EGP', type: 'villa', listingType: 'sale', status: 'available', location: { city: 'Cairo', district: 'Zamalek', street: 'Mohamed Mazhar' }, area: 1200, bedrooms: 8, bathrooms: 6, features: ['Nile View', 'Classic Interior', 'Garden'], images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200'], isApproved: true, featured: true },
  { title: 'Riyadh Modern Palace', description: 'Ultra-modern palace in Riyadh featuring grand majlis areas and state-of-the-art home automation.', price: 25000000, currency: 'SAR', type: 'villa', listingType: 'sale', status: 'available', location: { city: 'Riyadh', district: 'Al-Hada', street: 'King Fahd Rd' }, area: 2000, bedrooms: 10, bathrooms: 12, features: ['Majlis', 'Indoor Pool', 'Elevator'], images: ['https://images.unsplash.com/photo-1600607687940-4e52723659a9?w=1200'], isApproved: true, featured: true },
  { title: 'Tokyo Minimalist Studio', description: 'Compact and efficient living in the heart of Shibuya, designed by a leading Japanese architect.', price: 4500, currency: 'USD', type: 'studio', listingType: 'rent', status: 'available', location: { city: 'Tokyo', district: 'Shibuya', street: 'Omotesando' }, area: 60, bedrooms: 1, bathrooms: 1, features: ['Smart Home', 'Subway Access'], images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200'], isApproved: true, featured: false },
  { title: 'Rome Pantheon Apartment', description: 'Elegant apartment steps from the Pantheon, featuring original frescoes and Roman architecture.', price: 1500000, currency: 'EUR', type: 'apartment', listingType: 'sale', status: 'available', location: { city: 'Rome', district: 'Centro Storico', street: 'Via del Corso' }, area: 140, bedrooms: 2, bathrooms: 2, features: ['Historical Building', 'High Ceilings'], images: ['https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200'], isApproved: true, featured: false },
  { title: 'Beverly Hills Estate', description: 'World-class estate in Beverly Hills with a private cinema and sprawling grounds.', price: 35000000, currency: 'USD', type: 'villa', listingType: 'sale', status: 'available', location: { city: 'Los Angeles', district: 'Beverly Hills', street: 'Sunset Blvd' }, area: 1500, bedrooms: 9, bathrooms: 11, features: ['Cinema', 'Wine Cellar', 'Basketball Court'], images: ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200'], isApproved: true, featured: true },
  { title: 'Al-Rehab Family Villa', description: 'Spacious family home in New Cairo with a private garden and proximity to top schools.', price: 12000000, currency: 'EGP', type: 'villa', listingType: 'sale', status: 'available', location: { city: 'Cairo', district: 'New Cairo', street: 'Group 120' }, area: 450, bedrooms: 4, bathrooms: 4, features: ['Garden', 'Security', 'Club Access'], images: ['https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200'], isApproved: false, featured: false },
  { title: 'Dubai Hills Mansion', description: 'Contemporary mansion overlooking the golf course in the prestigious Dubai Hills Estate.', price: 55000000, currency: 'AED', type: 'villa', listingType: 'sale', status: 'available', location: { city: 'Dubai', district: 'Dubai Hills', street: 'Parkway Vistas' }, area: 1100, bedrooms: 7, bathrooms: 8, features: ['Golf Course View', 'Gym', 'Infinity Pool'], images: ['https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200'], isApproved: false, featured: true },
  { title: 'Giza Pyramid View Condo', description: 'Wake up to the Giza Pyramids every day in this modern, high-floor luxury apartment.', price: 3500, currency: 'USD', type: 'apartment', listingType: 'rent', status: 'available', location: { city: 'Giza', district: 'Pyramids', street: 'Haram St' }, area: 200, bedrooms: 3, bathrooms: 2, features: ['Pyramid View', 'Balcony'], images: ['https://images.unsplash.com/photo-1515263487990-61b07816b324?w=1200'], isApproved: false, featured: false },
  { title: 'Marina Gate 2 - High Floor', description: 'Luxurious apartment in Marina Gate with full marina views and designer furniture.', price: 12000, currency: 'AED', type: 'apartment', listingType: 'rent', status: 'available', location: { city: 'Dubai', district: 'Marina', street: 'Marina Gate' }, area: 150, bedrooms: 2, bathrooms: 2, features: ['Marina View', 'Full Furniture'], images: ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200'], isApproved: true, featured: false },
  { title: 'Palm Jumeirah Signature Villa', description: 'Private beachfront living on the Palm Jumeirah with a custom-designed luxury villa.', price: 85000000, currency: 'AED', type: 'villa', listingType: 'sale', status: 'available', location: { city: 'Dubai', district: 'Palm Jumeirah', street: 'Frond M' }, area: 1300, bedrooms: 6, bathrooms: 7, features: ['Private Beach', 'Bespoke Design'], images: ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200'], isApproved: true, featured: true },
  { title: 'Sheikh Zayed - Compound Villa', description: 'Modern villa in a quiet Sheikh Zayed compound, featuring a private pool and smart home features.', price: 15000000, currency: 'EGP', type: 'villa', listingType: 'sale', status: 'available', location: { city: 'Cairo', district: 'Sheikh Zayed', street: 'Beverly Hills Compound' }, area: 500, bedrooms: 5, bathrooms: 5, features: ['Swimming Pool', 'Smart Home'], images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200'], isApproved: true, featured: false }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');
    let owner = await User.findOne({ email: SEED_OWNER_EMAIL });
    if (!owner) {
      owner = await User.create({ name: 'Luxe Estates', email: SEED_OWNER_EMAIL, password: 'LuxeOwner@2025!', role: 'owner', isVerified: true, isActive: true });
    }
    await Property.deleteMany({ owner: owner._id });
    const toInsert = PROPERTIES.map(p => ({ ...p, owner: owner._id }));
    const inserted = await Property.insertMany(toInsert);
    console.log(`✅ ${inserted.length} properties seeded successfully!`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
}
seed();
