const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const Notification = require('./src/models/notification.model');
const User = require('./src/models/user.model');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB...');

    const admin = await User.findOne({ email: 'admin@aqario-luxe.com' });
    if (!admin) {
      console.log('❌ Admin user not found');
      process.exit(1);
    }

    // Clear previous notifications for admin
    await Notification.deleteMany({ userId: admin._id });

    const notifs = [
      {
        userId: admin._id,
        title: 'NOTIFICATION.NEW_INQUIRY',
        message: 'قام أحمد المحمدي بإرسال استفسار حول عقار فيلا مودرن في قنا الجديدة',
        type: 'inquiry',
        isRead: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 10),
      },
      {
        userId: admin._id,
        title: 'NOTIFICATION.NEW_BOOKING',
        message: 'قام محمود حسن بتقديم طلب حجز للعقار شقة دوبلكس بنجع حمادي',
        type: 'booking',
        isRead: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 35),
      },
      {
        userId: admin._id,
        title: 'NOTIFICATION.NEW_VIEWING',
        message: 'طلب معاينة جديد من سارة علي لمعاينة تاون هاوس بقوص يوم السبت القادم',
        type: 'viewing',
        isRead: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 90),
      },
      {
        userId: admin._id,
        title: 'NOTIFICATION.NEW_KYC_SUBMISSION',
        message: 'قام المستخدم Eslam Yasser بتقديم مستندات التحقق من الهوية الخاصة به.',
        type: 'kyc',
        isRead: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 180),
      },
      {
        userId: admin._id,
        title: 'NOTIFICATION.NEW_REVIEW',
        message: 'قام خالد عمر بتقديم تقييم 5 نجوم على قطعة أرض بقنا الجديدة',
        type: 'review',
        isRead: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 300),
      },
    ];

    await Notification.insertMany(notifs);
    console.log('✅ Diverse notifications inserted for admin successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
