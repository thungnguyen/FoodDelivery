import express from 'express';
const router = express.Router();

import jwt from 'jsonwebtoken';
import Restaurant from '../models/Restaurant.js';
import SuperAdmin from '../models/SuperAdmin.js';
import authMiddleware from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';
import { sendEmail } from '../utils/emailService.js';
import bcrypt from 'bcryptjs';

const DEFAULT_ADMIN_RECIPIENTS = ['thanhhungnguyen8204@gmail.com', 'thanhhunggpt@gmail.com'];
const DEFAULT_OTP_TTL_MS = 5 * 60 * 1000;
const OTP_TTL_MS = Number(process.env.RESTAURANT_ONBOARDING_OTP_TTL_MS) || DEFAULT_OTP_TTL_MS;
const PASSWORD_POLICY_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

// Register a new restaurant (awaiting admin approval)
router.post('/register', upload.single('profilePicture'), async (req, res) => {
  const { name, taxCode, ownerName, location, contactNumber, email } = req.body;
  const profilePicture = req.file ? `/uploads/${req.file.filename}` : '';

  const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
  const requiredFields = {
    name: trimmed(name),
    taxCode: trimmed(taxCode),
    ownerName: trimmed(ownerName),
    location: trimmed(location),
    contactNumber: trimmed(contactNumber),
    email: trimmed(email).toLowerCase(),
  };

  try {
    if (Object.values(requiredFields).some((item) => !item)) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin bắt buộc.' });
    }

    const existingRestaurant = await Restaurant.findOne({
      $or: [
        { name: requiredFields.name },
        { taxCode: requiredFields.taxCode },
        { 'admin.email': requiredFields.email },
      ],
    });

    if (existingRestaurant) {
      let message = 'Hồ sơ đã tồn tại trên hệ thống.';
      if (existingRestaurant.taxCode === requiredFields.taxCode) {
        message = 'Mã số thuế đã được sử dụng cho một nhà hàng khác.';
      } else if (existingRestaurant.admin?.email === requiredFields.email) {
        message = 'Email quản trị đã được đăng ký.';
      } else if (existingRestaurant.name === requiredFields.name) {
        message = 'Tên nhà hàng đã tồn tại.';
      }
      return res.status(400).json({ message });
    }

    const newRestaurant = new Restaurant({
      name: requiredFields.name,
      taxCode: requiredFields.taxCode,
      ownerName: requiredFields.ownerName,
      location: requiredFields.location,
      contactNumber: requiredFields.contactNumber,
      profilePicture,
      admin: { email: requiredFields.email },
      onboardingPasswordMustChange: true,
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
      const subject = `Yêu cầu duyệt nhà hàng mới: ${newRestaurant.name}`;
      const reviewUrl = `${process.env.SUPER_ADMIN_PORTAL_URL || 'http://localhost:3000/super-admin/dashboard'}`;
      const html = `
        <h2>Nhà hàng mới vừa đăng ký</h2>
        <p><strong>Tên nhà hàng:</strong> ${newRestaurant.name}</p>
        <p><strong>Mã số thuế:</strong> ${newRestaurant.taxCode}</p>
        <p><strong>Chủ sở hữu:</strong> ${newRestaurant.ownerName}</p>
        <p><strong>Địa điểm:</strong> ${newRestaurant.location}</p>
        <p><strong>Email quản trị:</strong> ${newRestaurant.admin.email}</p>
        <p><strong>Số liên hệ:</strong> ${newRestaurant.contactNumber}</p>
        <p>Vui lòng đăng nhập trang Super Admin để duyệt: <a href="${reviewUrl}">${reviewUrl}</a></p>
      `;
      const text = [
        `Nhà hàng mới vừa nộp hồ sơ:`,
        `- Tên: ${newRestaurant.name}`,
        `- Mã số thuế: ${newRestaurant.taxCode}`,
        `- Chủ sở hữu: ${newRestaurant.ownerName}`,
        `- Địa điểm: ${newRestaurant.location}`,
        `- Email quản trị: ${newRestaurant.admin.email}`,
        `- Số liên hệ: ${newRestaurant.contactNumber}`,
        `Đăng nhập trang Super Admin để duyệt: ${reviewUrl}`,
      ].join('\n');

      try {
        const notifyResult = await sendEmail({
          to: recipients,
          subject,
          html,
          text,
        });
        if (notifyResult?.skipped) {
          console.warn(
            '[restaurant-email] Registration alert email was not sent. Check mail transport configuration.'
          );
        }
      } catch (err) {
        console.error('Failed to dispatch restaurant registration email:', err.message);
      }
    }

    if (newRestaurant.admin.email) {
      const html = `
        <h2>Xin chào ${newRestaurant.ownerName},</h2>
        <p>Chúng tôi đã nhận được hồ sơ đăng ký của nhà hàng <strong>${newRestaurant.name}</strong> (MST: ${newRestaurant.taxCode}).</p>
        <p>Đội ngũ Super Admin sẽ xem xét và gửi email thông báo khi hồ sơ được duyệt. Khi đó bạn sẽ nhận được mật khẩu tạm thời và mã OTP để kích hoạt tài khoản quản trị nhà hàng.</p>
        <p>Trân trọng!</p>
      `;
      const text = [
        `Xin chào ${newRestaurant.ownerName},`,
        `Chúng tôi đã nhận hồ sơ đăng ký nhà hàng ${newRestaurant.name} (MST: ${newRestaurant.taxCode}).`,
        'Super Admin sẽ duyệt và gửi mật khẩu tạm thời cùng mã OTP qua email khi hồ sơ được chấp thuận.',
        'Trân trọng!',
      ].join('\n');

      try {
        const ackResult = await sendEmail({
          to: newRestaurant.admin.email,
          subject: 'Hồ sơ đăng ký nhà hàng đã được tiếp nhận',
          html,
          text,
        });
        if (ackResult?.skipped) {
          console.warn(
            '[restaurant-email] Registration acknowledgment email simulated only. Configure RESEND_API_KEY or SMTP credentials to enable delivery.'
          );
        }
      } catch (err) {
        console.error('Failed to send restaurant acknowledgement email:', err.message);
      }
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

    if (restaurant.onboardingPasswordMustChange) {
      return res.status(403).json({
        message: 'Tài khoản cần được kích hoạt bằng OTP và đổi mật khẩu trước khi đăng nhập.',
        requiresPasswordChange: true,
      });
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

// Verify onboarding OTP and temporary password
router.post('/onboarding/verify', async (req, res) => {
  const { email, password, otp } = req.body;
  const normalisedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalisedEmail || typeof password !== 'string' || typeof otp !== 'string') {
    return res.status(400).json({ message: 'Vui lòng cung cấp email, mật khẩu tạm thời và mã OTP.' });
  }

  try {
    const restaurant = await Restaurant.findOne({ 'admin.email': normalisedEmail });
    if (!restaurant) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhà hàng.' });
    }

    if (restaurant.approvalStatus !== 'approved') {
      return res.status(403).json({ message: 'Hồ sơ nhà hàng chưa được duyệt.' });
    }

    if (!restaurant.onboardingOtpHash || !restaurant.onboardingOtpExpiresAt) {
      return res.status(409).json({
        message: 'OTP chưa được kích hoạt. Vui lòng kiểm tra lại email phê duyệt hoặc liên hệ quản trị viên.',
      });
    }

    const now = new Date();
    if (restaurant.onboardingOtpExpiresAt.getTime() < now.getTime()) {
      restaurant.onboardingOtpHash = undefined;
      restaurant.onboardingOtpExpiresAt = undefined;
      restaurant.onboardingPasswordMustChange = true;
      await restaurant.save();
      return res.status(410).json({
        message: 'Mã OTP đã hết hạn. Vui lòng liên hệ Super Admin để được cấp lại thông tin đăng nhập.',
      });
    }

    const passwordMatch = await restaurant.compareAdminPassword(password);
    if (!passwordMatch) {
      return res.status(400).json({ message: 'Mật khẩu tạm thời không chính xác.' });
    }

    const otpMatch = await bcrypt.compare(otp, restaurant.onboardingOtpHash);
    if (!otpMatch) {
      return res.status(400).json({ message: 'Mã OTP không chính xác.' });
    }

    restaurant.onboardingOtpHash = undefined;
    restaurant.onboardingOtpExpiresAt = undefined;
    restaurant.onboardingOtpVerifiedAt = new Date();
    restaurant.onboardingPasswordMustChange = true;
    await restaurant.save();

    const resetToken = jwt.sign(
      {
        restaurantId: restaurant._id.toString(),
        purpose: 'restaurant-onboarding-reset',
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    return res.status(200).json({
      message: 'Xác thực OTP thành công. Vui lòng đặt lại mật khẩu ngay.',
      resetToken,
      expiresIn: 600,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Set new password after OTP verification
router.post('/onboarding/set-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (typeof token !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ message: 'Thiếu token xác thực hoặc mật khẩu mới.' });
  }

  if (!PASSWORD_POLICY_REGEX.test(newPassword)) {
    return res.status(400).json({
      message: 'Mật khẩu mới phải tối thiểu 6 ký tự và bao gồm chữ, số và ký tự đặc biệt.',
    });
  }

  try {
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }

    if (payload?.purpose !== 'restaurant-onboarding-reset' || !payload?.restaurantId) {
      return res.status(401).json({ message: 'Token không hợp lệ.' });
    }

    const restaurant = await Restaurant.findById(payload.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhà hàng.' });
    }

    if (!restaurant.onboardingOtpVerifiedAt) {
      return res.status(409).json({
        message: 'Chưa xác thực OTP. Vui lòng hoàn tất bước xác thực trước khi đổi mật khẩu.',
      });
    }

    restaurant.admin.password = newPassword;
    restaurant.onboardingPasswordMustChange = false;
    await restaurant.save();

    return res.status(200).json({
      message: 'Đổi mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.',
    });
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
