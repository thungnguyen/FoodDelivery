import express from 'express';
const router = express.Router();

import jwt from 'jsonwebtoken';
import Restaurant from '../models/Restaurant.js';
import SuperAdmin from '../models/SuperAdmin.js';
import authMiddleware from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';
import { sendEmail } from '../utils/emailService.js';

const DEFAULT_ADMIN_RECIPIENTS = ['thanhhungnguyen8204@gmail.com', 'thanhhunggpt@gmail.com'];

// Register a new restaurant (with admin email and password)
router.post('/register', upload.single('profilePicture'), async (req, res) => {
  const { name, ownerName, location, contactNumber, email, password } = req.body;
  const profilePicture = req.file ? `/uploads/${req.file.filename}` : '';

  try {
    const existingRestaurant = await Restaurant.findOne({
      $or: [{ name }, { 'admin.email': email }],
    });
    if (existingRestaurant) {
      return res.status(400).json({ message: 'Restaurant or Email already exists' });
    }

    const newRestaurant = new Restaurant({
      name,
      ownerName,
      location,
      contactNumber,
      profilePicture,
      admin: { email, password },
    });

    await newRestaurant.save();

    const manualRecipients = (process.env.ADMIN_NOTIFICATION_EMAILS || DEFAULT_ADMIN_RECIPIENTS.join(','))
      .split(',')
      .map((addr) => addr.trim())
      .filter(Boolean);

    const adminRecords = await SuperAdmin.find().select('email').lean();
    const adminEmails = adminRecords.map((record) => record.email);
    const recipients = Array.from(new Set([...manualRecipients, ...adminEmails]));

    if (recipients.length) {
      const subject = `Yêu cầu duyệt nhà hàng mới: ${name}`;
      const reviewUrl = `${process.env.SUPER_ADMIN_PORTAL_URL || 'http://localhost:3000/super-admin/dashboard'}`;
      const html = `
        <h2>Nhà hàng mới vừa đăng ký</h2>
        <p><strong>Tên nhà hàng:</strong> ${name}</p>
        <p><strong>Chủ sở hữu:</strong> ${ownerName}</p>
        <p><strong>Địa điểm:</strong> ${location}</p>
        <p><strong>Email quản trị:</strong> ${email}</p>
        <p><strong>Số liên hệ:</strong> ${contactNumber}</p>
        <p>Vui lòng đăng nhập trang Super Admin để duyệt: <a href="${reviewUrl}">${reviewUrl}</a></p>
      `;
      const text = [
        `Nhà hàng mới vừa nộp hồ sơ:`,
        `- Tên: ${name}`,
        `- Chủ sở hữu: ${ownerName}`,
        `- Địa điểm: ${location}`,
        `- Email quản trị: ${email}`,
        `- Số liên hệ: ${contactNumber}`,
        `Đăng nhập trang Super Admin để duyệt: ${reviewUrl}`,
      ].join('\n');

      await sendEmail({
        to: recipients,
        subject,
        html,
        text,
      }).catch((err) => {
        console.error('Failed to dispatch restaurant registration email:', err.message);
      });
    }

    if (email) {
      const html = `
        <h2>Xin chào ${ownerName},</h2>
        <p>Chúng tôi đã nhận được hồ sơ đăng ký của nhà hàng <strong>${name}</strong>.</p>
        <p>Đội ngũ Super Admin sẽ xem xét và phản hồi qua email trong thời gian sớm nhất.</p>
        <p>Trân trọng!</p>
      `;
      const text = [
        `Xin chào ${ownerName},`,
        `Chúng tôi đã nhận hồ sơ đăng ký nhà hàng ${name}.`,
        'Super Admin sẽ duyệt và phản hồi qua email trong thời gian sớm nhất.',
        'Trân trọng!',
      ].join('\n');

      await sendEmail({
        to: email,
        subject: 'Hồ sơ đăng ký nhà hàng đã được tiếp nhận',
        html,
        text,
      }).catch((err) => console.error('Failed to send restaurant acknowledgement email:', err.message));
    }

    res.status(201).json({
      message: 'Đăng ký thành công. Hồ sơ của bạn đang chờ Super Admin phê duyệt.',
      restaurant: {
        id: newRestaurant._id,
        approvalStatus: newRestaurant.approvalStatus,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Login restaurant admin
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const restaurant = await Restaurant.findOne({ 'admin.email': email });
    if (!restaurant) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await restaurant.compareAdminPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: restaurant._id,
        restaurantId: restaurant._id,
        role: 'restaurant',
        email: restaurant.admin.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '30d',
      }
    );

    res.status(200).json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.user.id).select('-admin.password');
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }
    res.status(200).json(restaurant);
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// Update restaurant details
router.put('/update', authMiddleware, upload.single('profilePicture'), async (req, res) => {
  const { name, ownerName, location, contactNumber, profilePictureUrl } = req.body;

  try {
    const restaurant = await Restaurant.findById(req.user.id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    // Update fields if provided
    if (name) restaurant.name = name;
    if (ownerName) restaurant.ownerName = ownerName;
    if (location) restaurant.location = location;
    if (contactNumber) restaurant.contactNumber = contactNumber;

    // Update profile picture if a file is uploaded
    if (req.file) {
      restaurant.profilePicture = `/uploads/${req.file.filename}`;
    } else if (typeof profilePictureUrl === 'string') {
      restaurant.profilePicture = profilePictureUrl.trim();
    }

    await restaurant.save();
    res.status(200).json({ message: 'Profile updated successfully', restaurant });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Update availability
router.put('/availability', authMiddleware, async (req, res) => {
  const { availability } = req.body;

  try {
    const restaurant = await Restaurant.findById(req.user.id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    if (typeof availability !== 'boolean') {
      return res.status(400).json({ message: 'Invalid value for availability. Must be true or false.' });
    }

    restaurant.availability = availability;
    await restaurant.save();

    res.status(200).json({ message: `Restaurant is now ${availability ? 'Open' : 'Closed'}`, availability });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Get all restaurants (Public - for customers to browse)
router.get('/all', async (req, res) => {
  try {
    const restaurants = await Restaurant.find({ availability: true }).select('-admin.password');
    res.status(200).json(restaurants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Get restaurant by ID (Public - for customers)
router.get('/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id).select('-admin.password');
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }
    res.status(200).json(restaurant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

export default router;
