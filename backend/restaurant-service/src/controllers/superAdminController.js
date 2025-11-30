import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import Restaurant from '../models/Restaurant.js';
import { sendEmail } from '../utils/emailService.js';

const DEFAULT_OTP_TTL_MS = 5 * 60 * 1000;
const OTP_TTL_MS = Number(process.env.RESTAURANT_ONBOARDING_OTP_TTL_MS) || DEFAULT_OTP_TTL_MS;
const PASSWORD_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const PASSWORD_NUMBERS = '23456789';
const PASSWORD_SPECIALS = '@$!%*?&';
const PASSWORD_ALL = PASSWORD_LETTERS + PASSWORD_NUMBERS + PASSWORD_SPECIALS;
const DEFAULT_ADMIN_NOTIFICATION_EMAILS = ['thanhhungnguyen8204@gmail.com', 'thanhhunggpt@gmail.com'];
const computeFullAddress = (address = {}) => {
  const parts = [address.street, address.ward, address.district, address.city]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
};
const parseCoordinates = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw) && raw.length === 2) {
    const lng = Number(raw[0]);
    const lat = Number(raw[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }
    return null;
  }
  if (typeof raw === 'object') {
    const lat = Number(raw.lat ?? raw.latitude);
    const lng = Number(raw.lng ?? raw.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }
  }
  return null;
};

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
  const buffer = crypto.randomBytes(3); // 3 bytes ~ 16,777,216
  const numeric = buffer.readUIntBE(0, 3) % 1_000_000;
  return numeric.toString().padStart(6, '0');
};

// Get all restaurants (Super Admin only)
export const getAllRestaurants = async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({ message: 'Access denied, only Super Admin can access this resource' });
    }

    const restaurants = await Restaurant.find().sort({ createdAt: -1 });
    res.status(200).json(restaurants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get a specific restaurant by ID (Super Admin only)
export const getRestaurantById = async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({ message: 'Access denied, only Super Admin can access this resource' });
    }

    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    res.status(200).json(restaurant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Delete a restaurant (Super Admin only)
export const deleteRestaurant = async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({ message: 'Access denied, only Super Admin can access this resource' });
    } else {
      activationBundle.deliveryStatus = 'skipped';
      activationBundle.deliveryError = 'Restaurant admin email is missing.';
    }

    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    // Delete associated food items here (if needed)
    // await FoodItem.deleteMany({ restaurant: restaurant._id });

    await restaurant.deleteOne();
    res.status(200).json({ message: 'Restaurant deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Update restaurant details (Super Admin only)
export const updateRestaurant = async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({ message: 'Access denied, only Super Admin can update restaurants' });
    }

    const { id } = req.params;
    const updates = req.body;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    const allowedFields = ['name', 'ownerName', 'contactNumber', 'approvalNotes', 'bankAccountNumber', 'bankAccountName', 'bankName'];
    allowedFields.forEach((field) => {
      if (typeof updates[field] !== 'undefined') {
        restaurant[field] = updates[field];
      }
    });

    const addressUpdates =
      (updates.address && typeof updates.address === 'object' && updates.address) ||
      null;

    if (addressUpdates) {
      restaurant.address = { ...(restaurant.address?.toObject?.() || {}), ...addressUpdates };
      const fullAddress =
        restaurant.address.fullAddress ||
        computeFullAddress(restaurant.address) ||
        restaurant.legacyLocation;
      if (fullAddress) {
        restaurant.address.fullAddress = fullAddress;
        restaurant.legacyLocation = restaurant.legacyLocation || fullAddress;
      }
      const coords =
        parseCoordinates(addressUpdates.location?.coordinates) || parseCoordinates(addressUpdates.coordinates);
      if (coords) {
        restaurant.address.location = {
          type: 'Point',
          coordinates: [coords[0], coords[1]],
        };
        restaurant.locationCoords = { lat: coords[1], lng: coords[0] };
      }
      restaurant.markModified('address');
    }

    if (typeof updates.availability === 'boolean') {
      restaurant.availability = updates.availability;
    }

    await restaurant.save();

    res.status(200).json({ message: 'Restaurant updated successfully', restaurant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const ensureSuperAdmin = (user) => user && user.role === 'superAdmin';

export const approveRestaurant = async (req, res) => {
  try {
    if (!ensureSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Access denied, only Super Admin can approve restaurants' });
    }

    const { id } = req.params;
    const { notes } = req.body;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    restaurant.approvalStatus = 'approved';
    restaurant.approvalNotes = notes || restaurant.approvalNotes || '';
    restaurant.approvedAt = new Date();
    restaurant.rejectedAt = null;
    restaurant.lastReviewedBy = req.user.id;
    restaurant.availability = true;
    const temporaryPassword = generateTemporaryPassword();
    const otpCode = generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    restaurant.admin.password = temporaryPassword;
    restaurant.onboardingOtpHash = otpHash;
    restaurant.onboardingOtpExpiresAt = otpExpiresAt;
    restaurant.onboardingOtpVerifiedAt = null;
    restaurant.onboardingPasswordMustChange = true;
    restaurant.onboardingEmailSentAt = new Date();

    await restaurant.save();

    const activationUrl = process.env.RESTAURANT_ONBOARDING_URL || 'http://localhost:3000/restaurant/activate';
    const expiryMinutes = Math.max(1, Math.round(OTP_TTL_MS / 60000));
    const activationBundle = {
      email: restaurant.admin.email,
      temporaryPassword,
      otpCode,
      otpExpiresAt: otpExpiresAt.toISOString(),
      activationUrl,
      deliveryStatus: 'pending',
      deliveryError: '',
    };

    if (restaurant.admin?.email) {
      const html = `
        <h2>Chúc mừng! Hồ sơ nhà hàng của bạn đã được phê duyệt 🎉</h2>
        <p><strong>Nhà hàng:</strong> ${restaurant.name}</p>
        <p><strong>Mã số thuế:</strong> ${restaurant.taxCode}</p>
        ${restaurant.approvalNotes ? `<p><strong>Ghi chú từ Super Admin:</strong> ${restaurant.approvalNotes}</p>` : ''}
        <p><strong>Mật khẩu tạm thời:</strong> ${temporaryPassword}</p>
        <p><strong>Mã OTP:</strong> ${otpCode}</p>
        <p>OTP có hiệu lực trong ${expiryMinutes} phút. Vui lòng truy cập <a href="${activationUrl}">${activationUrl}</a> để nhập OTP và mật khẩu tạm thời, sau đó đặt lại mật khẩu mới.</p>
        <p>Nếu bạn không hoàn tất trong thời gian quy định, hãy liên hệ Super Admin để được cấp lại thông tin.</p>
      `;
      const textLines = [
        'Chúc mừng, hồ sơ nhà hàng của bạn đã được phê duyệt.',
        `Nhà hàng: ${restaurant.name}`,
        `Mã số thuế: ${restaurant.taxCode}`,
      ];
      if (restaurant.approvalNotes) {
        textLines.push(`Ghi chú từ Super Admin: ${restaurant.approvalNotes}`);
      }
      textLines.push(
        `Mật khẩu tạm thời: ${temporaryPassword}`,
        `OTP: ${otpCode} (hiệu lực ${expiryMinutes} phút)`,
        `Truy cập ${activationUrl} để nhập OTP và đổi mật khẩu.`
      );

      try {
        const approvalResult = await sendEmail({
          to: restaurant.admin.email,
          subject: 'Hồ sơ nhà hàng đã được phê duyệt',
          html,
          text: textLines.join('\n'),
        });
        if (approvalResult?.skipped || approvalResult?.simulated) {
          console.warn(
            '[restaurant-email] Approval email not delivered. The OTP and mật khẩu tạm thời chỉ có trong log server.'
          );
          activationBundle.deliveryStatus = 'simulated';
          activationBundle.deliveryError =
            approvalResult?.error || 'Mail transport not configured. See server logs for preview.';
        } else {
          activationBundle.deliveryStatus = 'sent';
        }
      } catch (err) {
        console.error('Failed to send restaurant approval email:', err.message);
        activationBundle.deliveryStatus = 'failed';
        activationBundle.deliveryError = err.message;
      }
    }

    const rawManualRecipients = process.env.ADMIN_NOTIFICATION_EMAILS || DEFAULT_ADMIN_NOTIFICATION_EMAILS.join(',');
    const adminRecipients = rawManualRecipients
      .split(',')
      .map((addr) => addr.trim())
      .filter(Boolean);

    if (adminRecipients.length) {
      const summaryHtml = `
        <h2>OTP mới cho nhà hàng ${restaurant.name}</h2>
        <p><strong>Mã số thuế:</strong> ${restaurant.taxCode}</p>
        <p><strong>Email quản trị:</strong> ${restaurant.admin.email}</p>
        <p><strong>Mật khẩu tạm thời:</strong> ${temporaryPassword}</p>
        <p><strong>OTP:</strong> ${otpCode} (hạn ${expiryMinutes} phút)</p>
        <p>Liên kết kích hoạt: <a href="${activationUrl}">${activationUrl}</a></p>
      `;
      const summaryText = [
        `Nhà hàng: ${restaurant.name} (MST ${restaurant.taxCode})`,
        `Email quản trị: ${restaurant.admin.email}`,
        `Mật khẩu tạm thời: ${temporaryPassword}`,
        `OTP: ${otpCode} (hạn ${expiryMinutes} phút)`,
        `Kích hoạt tại: ${activationUrl}`,
      ].join('\n');

      sendEmail({
        to: adminRecipients,
        subject: `OTP kích hoạt nhà hàng ${restaurant.name}`,
        html: summaryHtml,
        text: summaryText,
      }).catch((err) => console.error('Failed to notify admin about restaurant OTP:', err.message));
    }

    res.status(200).json({
      message: 'Restaurant approved successfully',
      restaurant,
      activation: activationBundle,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const rejectRestaurant = async (req, res) => {
  try {
    if (!ensureSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Access denied, only Super Admin can reject restaurants' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    restaurant.approvalStatus = 'rejected';
    restaurant.approvalNotes = reason || '';
    restaurant.rejectedAt = new Date();
    restaurant.lastReviewedBy = req.user.id;
    restaurant.availability = false;

    await restaurant.save();

    if (restaurant.admin?.email) {
      const html = `
        <h2>Rất tiếc, hồ sơ nhà hàng của bạn chưa thể được phê duyệt</h2>
        <p>Nhà hàng: <strong>${restaurant.name}</strong></p>
        <p>Vui lòng cập nhật lại thông tin và gửi lại yêu cầu.</p>
        ${reason ? `<p><strong>Lý do:</strong> ${reason}</p>` : ''}
      `;
      const textLines = [
        'Hồ sơ nhà hàng của bạn chưa thể được phê duyệt.',
        `Nhà hàng: ${restaurant.name}`,
      ];
      if (reason) {
        textLines.push(`Lý do: ${reason}`);
      }
      try {
        const rejectResult = await sendEmail({
          to: restaurant.admin.email,
          subject: 'Hồ sơ nhà hàng chưa được phê duyệt',
          html,
          text: textLines.join('\n'),
        });
        if (rejectResult?.skipped) {
          console.warn(
            '[restaurant-email] Rejection email was not delivered. Please verify email transport configuration.'
          );
        }
      } catch (err) {
        console.error('Failed to send restaurant rejection email:', err.message);
      }
    }

    res.status(200).json({ message: 'Restaurant rejected', restaurant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
