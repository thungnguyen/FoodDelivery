// backend/auth-service/controllers/customerController.js

const jwt        = require("jsonwebtoken");
const Customer   = require("../models/Customer");
const { sendEmail } = require("../utils/emailService");

const ALLOWED_ACCOUNT_STATUSES = ["active", "locked"];

const computeFullAddress = (address = {}) => {
  const parts = [address.street, address.ward, address.district, address.city]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.join(", ");
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
  if (typeof raw === "object") {
    const lat = Number(raw.lat ?? raw.latitude);
    const lng = Number(raw.lng ?? raw.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }
  }
  return null;
};

const buildAddressFromRequest = (payload = {}) => {
  const addressInput = payload.address && typeof payload.address === "object" ? payload.address : {};
  const normalise = (value) => (typeof value === "string" ? value.trim() : undefined);

  const street = normalise(addressInput.street ?? payload.street);
  const ward = normalise(addressInput.ward ?? payload.ward);
  const district = normalise(addressInput.district ?? payload.district);
  const city = normalise(addressInput.city ?? payload.city);
  const rawFull = normalise(addressInput.fullAddress ?? payload.fullAddress);
  const legacyText = normalise(payload.location || payload.addressText);

  const coordinates =
    parseCoordinates(addressInput.location?.coordinates) ||
    parseCoordinates(addressInput.location) ||
    parseCoordinates(addressInput.coordinates) ||
    parseCoordinates(payload.coordinates);

  const address = {};
  if (street) address.street = street;
  if (ward) address.ward = ward;
  if (district) address.district = district;
  if (city) address.city = city;

  const computedFull = rawFull || computeFullAddress(address) || legacyText;
  if (computedFull) address.fullAddress = computedFull;
  if (coordinates) {
    address.location = { type: "Point", coordinates };
  }

  return { address, legacyText };
};

const normalizeCustomerAddress = (customer) => {
  const rawAddress = customer.address ? customer.address.toObject?.() || customer.address : null;
  const legacy = customer.legacyAddress || customer.location;

  if (rawAddress && Object.keys(rawAddress).length) {
    const full = rawAddress.fullAddress || computeFullAddress(rawAddress) || legacy;
    return {
      ...rawAddress,
      ...(full ? { fullAddress: full } : {}),
    };
  }

  if (legacy) {
    return { fullAddress: legacy };
  }

  return undefined;
};

const formatCustomer = (customer) => ({
  id: customer._id,
  firstName: customer.firstName,
  lastName: customer.lastName,
  email: customer.email,
  phone: customer.phone,
  address: normalizeCustomerAddress(customer),
  accountStatus: customer.accountStatus,
  createdAt: customer.createdAt,
  updatedAt: customer.updatedAt,
});

// Helper to sign a JWT for a given user ID (and role)
const signToken = (userId) => {
  return jwt.sign(
    { id: userId, role: "customer" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

// @desc    Register a new customer
// @route   POST /api/auth/register/customer
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password } = req.body;
    const { address, legacyText } = buildAddressFromRequest(req.body);

    // 1) Check all required fields
    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ message: "Please provide all required fields." });
    }

    // 2) Prevent duplicate emails
    const existing = await Customer.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }

    // 3) Create and save the customer
    const newCustomer = await Customer.create({
      firstName,
      lastName,
      email,
      phone,
      password,
      address: Object.keys(address || {}).length ? address : undefined,
      legacyAddress: legacyText,
    });

    // 4) Sign JWT
    const token = signToken(newCustomer._id);

    if (email) {
      const html = `
        <h2>Chào mừng ${firstName}!</h2>
        <p>Tài khoản khách hàng của bạn đã được tạo thành công.</p>
        <p>Bạn có thể đăng nhập ứng dụng để đặt món và theo dõi đơn hàng ngay bây giờ.</p>
      `;
      const text = [
        `Chào mừng ${firstName}!`,
        'Tài khoản khách hàng của bạn đã được đăng ký thành công.',
        'Đăng nhập để bắt đầu đặt món và theo dõi đơn hàng.',
      ].join('\n');

      sendEmail({
        to: email,
        subject: 'Đăng ký tài khoản khách hàng thành công',
        html,
        text,
      }).catch((err) => console.error('Failed to send welcome email to customer:', err.message));
    }

    // 5) Respond
    res.status(201).json({
      status: "success",
      token,
      data: {
        customer: {
          ...formatCustomer(newCustomer),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Customer login
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1) Check email & password
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    // 2) Find customer & select password explicitly
    const customer = await Customer.findOne({ email }).select("+password");
    if (!customer) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (customer.accountStatus === "locked") {
      return res.status(403).json({
        message: "Tài khoản của bạn đang bị khóa. Vui lòng liên hệ bộ phận hỗ trợ.",
      });
    }

    // 3) Check password
    const valid = await customer.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // 4) Generate token
    const token = signToken(customer._id);

    // 5) Respond
    res.json({
      status: "success",
      token,
      data: {
        customer: formatCustomer(customer),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get currently logged-in customer profile
// @route   GET /api/auth/customer/me
// @access  Private (customer)
exports.getProfile = async (req, res, next) => {
  try {
    // req.userId is set by your auth middleware after validating JWT
    const customer = await Customer.findById(req.userId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    res.json({
      status: "success",
      data: {
        customer: formatCustomer(customer),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update customer profile (e.g. phone or address)
// @route   PATCH /api/auth/customer/me
// @access  Private (customer)
exports.updateProfile = async (req, res, next) => {
  try {
    const { address, legacyText } = buildAddressFromRequest(req.body);
    const updates = (({ firstName, lastName, phone }) =>
      ({ firstName, lastName, phone }))(req.body);

    if (address && Object.keys(address).length) {
      updates.address = address;
    }
    if (legacyText) {
      updates.legacyAddress = legacyText;
    }

    // Prevent email/password update here (use separate endpoints)
    delete updates.email;
    delete updates.password;

    const customer = await Customer.findByIdAndUpdate(
      req.userId,
      updates,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    res.json({
      status: "success",
      data: {
        customer: formatCustomer(customer),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update customer password
// @route   PATCH /api/auth/customer/password
// @access  Private (customer)
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ message: "Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới." });
    }

    if (!currentPassword.trim() || !newPassword.trim()) {
      return res.status(400).json({ message: "Mật khẩu không được để trống." });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "Mật khẩu mới phải khác mật khẩu hiện tại." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Mật khẩu mới phải có tối thiểu 6 ký tự." });
    }

    const customer = await Customer.findById(req.userId).select("+password");
    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    const isMatch = await customer.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu hiện tại không chính xác." });
    }

    customer.password = newPassword;
    await customer.save();

    res.json({
      status: "success",
      message: "Cập nhật mật khẩu thành công.",
    });
  } catch (err) {
    next(err);
  }
};

// Admin endpoints
exports.adminListCustomers = async (_req, res, next) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json({
      status: "success",
      customers: customers.map(formatCustomer),
    });
  } catch (err) {
    next(err);
  }
};

exports.adminUpdateCustomerStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ALLOWED_ACCOUNT_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ." });
    }

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    customer.accountStatus = status;
    customer.lockedAt = status === "locked" ? new Date() : null;
    await customer.save();

    res.json({
      status: "success",
      message: "Cập nhật trạng thái khách hàng thành công.",
      customer: formatCustomer(customer),
    });
  } catch (err) {
    next(err);
  }
};
