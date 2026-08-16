const mongoose = require('mongoose');
require('dotenv').config();

const Inquiry = require('./src/models/inquiry.model');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB...');

    const sampleRequests = [
      {
        type: 'property_submission',
        status: 'pending',
        content: 'طلب إدراج فيلا فاخرة في قنا الجديدة',
        details: {
          contactName: 'أحمد محمود',
          contactPhone: '01012345678',
          propertyType: 'فيلا',
          listingType: 'بيع',
          city: 'قنا الجديدة',
          notes: 'فيلا 300م² في الحي الأول تشطيب رائع، قريب من الخدمات.',
          submittedAt: new Date(Date.now() - 1000 * 60 * 30),
        },
      },
      {
        type: 'property_submission',
        status: 'approved',
        content: 'طلب إدراج شقة سكنية في نجع حمادي',
        details: {
          contactName: 'سارة عبد الله',
          contactPhone: '01122334455',
          propertyType: 'شقة',
          listingType: 'إيجار',
          city: 'نجع حمادي',
          notes: 'شقة 140م² دور ثالث، 3 غرف وحمامين.',
          submittedAt: new Date(Date.now() - 1000 * 60 * 120),
        },
      },
      {
        type: 'property_submission',
        status: 'pending',
        content: 'طلب إدراج قطعة أرض في قوص',
        details: {
          contactName: 'محمود البقلي',
          contactPhone: '01234567890',
          propertyType: 'أرض',
          listingType: 'بيع',
          city: 'قوص',
          notes: 'مساحة 500م² واجهة بحرية على شارع رئيسي.',
          submittedAt: new Date(Date.now() - 1000 * 60 * 360),
        },
      },
      {
        type: 'property_submission',
        status: 'rejected',
        content: 'طلب إدراج محل تجاري في قنا',
        details: {
          contactName: 'علي حسن',
          contactPhone: '01555667788',
          propertyType: 'محل تجاري',
          listingType: 'بيع',
          city: 'قنا',
          notes: 'محل 50م² بموقع حيوي.',
          submittedAt: new Date(Date.now() - 1000 * 60 * 720),
        },
      },
    ];

    await Inquiry.insertMany(sampleRequests);
    console.log('✅ Sample property requests inserted successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
