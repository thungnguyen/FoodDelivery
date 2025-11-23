import crypto from 'crypto';
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

const PASSWORD_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const PASSWORD_NUMBERS = '23456789';
const PASSWORD_SPECIALS = '@$!%*?&';
const PASSWORD_ALL = PASSWORD_LETTERS + PASSWORD_NUMBERS + PASSWORD_SPECIALS;

const randomFrom = (alphabet) => {
  const buffer = crypto.randomBytes(1);
  return alphabet[buffer[0] % alphabet.length];
};

const shuffleArray = (input) => {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = crypto.randomBytes(1)[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const generateTemporaryPassword = (length = 10) => {
  const baseChars = [
    randomFrom(PASSWORD_LETTERS),
    randomFrom(PASSWORD_NUMBERS),
    randomFrom(PASSWORD_SPECIALS),
  ];
  while (baseChars.length < length) {
    baseChars.push(randomFrom(PASSWORD_ALL));
  }
  return shuffleArray(baseChars).join('');
};

const generateOtpCode = () => {
  const buffer = crypto.randomBytes(3);
  const numeric = buffer.readUIntBE(0, 3) % 1_000_000;
  return numeric.toString().padStart(6, '0');
};

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
      await restaurant.save({ validateBeforeSave: false });
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
    await restaurant.save({ validateBeforeSave: false });

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

router.post('/onboarding/resend', async (req, res) => {
  const { email } = req.body;
  const normalisedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalisedEmail) {
    return res.status(400).json({ message: 'Vui lòng cung cấp email quản trị nhà hàng.' });
  }

  try {
    const restaurant = await Restaurant.findOne({ 'admin.email': normalisedEmail });
    if (!restaurant) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản nhà hàng.' });
    }

    if (!restaurant.admin || typeof restaurant.admin !== 'object') {
      restaurant.admin = { email: normalisedEmail };
    } else if (!restaurant.admin.email) {
      restaurant.admin.email = normalisedEmail;
    }

    if (restaurant.approvalStatus !== 'approved') {
      return res.status(403).json({ message: 'Hồ sơ nhà hàng chưa được duyệt.' });
    }

    if (restaurant.onboardingPasswordMustChange === false) {
      return res.status(409).json({
        message: 'Tài khoản đã được kích hoạt. Vui lòng đăng nhập bằng mật khẩu hiện tại.',
      });
    }

    const temporaryPassword = generateTemporaryPassword();
    const otpCode = generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    restaurant.admin.password = temporaryPassword;
    restaurant.markModified('admin');
    restaurant.onboardingOtpHash = otpHash;
    restaurant.onboardingOtpExpiresAt = otpExpiresAt;
    restaurant.onboardingOtpVerifiedAt = null;
    restaurant.onboardingPasswordMustChange = true;
    restaurant.onboardingEmailSentAt = new Date();

    await restaurant.save({ validateBeforeSave: false });

    const activationUrl = process.env.RESTAURANT_ONBOARDING_URL || 'http://localhost:3000/restaurant/activate';
    const expiryMinutes = Math.max(1, Math.round(OTP_TTL_MS / 60000));

    if (restaurant.admin?.email) {
      const html = `
        <h2>Yêu cầu gửi lại thông tin kích hoạt tài khoản</h2>
        <p><strong>Nhà hàng:</strong> ${restaurant.name}</p>
        <p><strong>Mật khẩu tạm thời mới:</strong> ${temporaryPassword}</p>
        <p><strong>Mã OTP mới:</strong> ${otpCode}</p>
        <p>OTP có hiệu lực trong ${expiryMinutes} phút. Vui lòng truy cập <a href="${activationUrl}">${activationUrl}</a> để nhập OTP và đổi mật khẩu.</p>
        <p>Nếu bạn không yêu cầu thao tác này, vui lòng liên hệ đội hỗ trợ ngay lập tức.</p>
      `;
      const text = [
        'Bạn vừa yêu cầu gửi lại thông tin kích hoạt tài khoản nhà hàng.',
        `Nhà hàng: ${restaurant.name}`,
        `Mật khẩu tạm thời mới: ${temporaryPassword}`,
        `OTP mới: ${otpCode} (hiệu lực ${expiryMinutes} phút)`,
        `Truy cập ${activationUrl} để nhập OTP và đổi mật khẩu.`,
        'Nếu không phải bạn yêu cầu, hãy liên hệ đội hỗ trợ.',
      ].join('\n');

      try {
        const resendResult = await sendEmail({
          to: restaurant.admin.email,
          subject: 'Thông tin kích hoạt tài khoản nhà hàng',
          html,
          text,
        });

        if (resendResult?.skipped || resendResult?.simulated) {
          console.warn(
            '[restaurant-email] Activation email resend simulated. Check mail transport configuration.'
          );
        }
      } catch (err) {
        console.error('Failed to resend activation email:', err.message);
      }
    }

    return res.status(200).json({
      message: 'Đã gửi lại mật khẩu tạm thời và mã OTP mới. Vui lòng kiểm tra email của bạn.',
    });
  } catch (error) {
    console.error(error);
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
    await restaurant.save({ validateBeforeSave: false });

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
  const {
    name,
    ownerName,
    location,
    contactNumber,
    profilePictureUrl,
    bankAccountNumber,
    bankAccountName,
    bankName,
  } = req.body || {};

  const updates = {};
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedOwner = typeof ownerName === 'string' ? ownerName.trim() : '';
  const trimmedLocation = typeof location === 'string' ? location.trim() : '';
  const trimmedContact = typeof contactNumber === 'string' ? contactNumber.trim() : '';
  const trimmedImageUrl = typeof profilePictureUrl === 'string' ? profilePictureUrl.trim() : '';
  const trimmedBankNumber = typeof bankAccountNumber === 'string' ? bankAccountNumber.trim() : '';
  const trimmedBankName = typeof bankName === 'string' ? bankName.trim() : '';
  const trimmedBankHolder = typeof bankAccountName === 'string' ? bankAccountName.trim() : '';

  if (trimmedName) updates.name = trimmedName;
  if (trimmedOwner) updates.ownerName = trimmedOwner;
  if (trimmedLocation) updates.location = trimmedLocation;
  if (trimmedContact) updates.contactNumber = trimmedContact;
  if (trimmedBankNumber) updates.bankAccountNumber = trimmedBankNumber;
  if (trimmedBankName) updates.bankName = trimmedBankName;
  if (trimmedBankHolder) updates.bankAccountName = trimmedBankHolder;

  if (req.file) {
    updates.profilePicture = `/uploads/${req.file.filename}`;
  } else if (trimmedImageUrl) {
    updates.profilePicture = trimmedImageUrl;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ message: 'Không có thông tin nào được cập nhật.' });
  }

  try {
    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedRestaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    res.status(200).json({ message: 'Profile updated successfully', restaurant: updatedRestaurant });
  } catch (err) {
    console.error('[restaurant:update] Failed to update profile', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Update restaurant admin password
router.put('/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ mật khẩu hiện tại và mật khẩu mới.' });
  }

  if (currentPassword.trim().length === 0 || newPassword.trim().length === 0) {
    return res.status(400).json({ message: 'Mật khẩu không được để trống.' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
  }

  if (!PASSWORD_POLICY_REGEX.test(newPassword)) {
    return res.status(400).json({
      message: 'Mật khẩu mới phải từ 6 ký tự và bao gồm chữ, số và ký tự đặc biệt.',
    });
  }

  try {
    const restaurant = await Restaurant.findById(req.user.id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    const isMatch = await restaurant.compareAdminPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác.' });
    }

    restaurant.admin.password = newPassword;
    restaurant.onboardingPasswordMustChange = false;
    restaurant.markModified('admin');
    await restaurant.save({ validateBeforeSave: false });

    return res.status(200).json({ message: 'Đổi mật khẩu thành công.' });
  } catch (err) {
    console.error('[restaurant:password] Failed to update password', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Update availability
const parseBooleanValue = (raw) => {
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (['true', '1', 'yes', 'open', 'available'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'closed', 'unavailable'].includes(normalized)) {
      return false;
    }
  }
  return null;
};

router.put('/availability', authMiddleware, async (req, res) => {
  const { availability } = req.body;

  try {
    const parsedAvailability = parseBooleanValue(availability);
    if (parsedAvailability === null) {
      return res.status(400).json({ message: 'Invalid value for availability. Must be true or false.' });
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      req.user.id,
      { $set: { availability: parsedAvailability } },
      { new: true, runValidators: false, select: '-admin.password' }
    );

    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    res
      .status(200)
      .json({
        message: `Restaurant is now ${parsedAvailability ? 'Open' : 'Closed'}`,
        availability: restaurant.availability,
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Get all restaurants (Public - for customers to browse)
router.get('/all', async (req, res) => {
  try {
    const includeClosed = req.query.includeClosed === 'true';
    const filter = includeClosed ? {} : { availability: true };
    const restaurants = await Restaurant.find(filter).select('-admin.password');
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
