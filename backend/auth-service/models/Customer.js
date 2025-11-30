// backend/auth-service/models/Customer.js
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number],
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: "Coordinates must be [lng, lat]",
      },
    },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true },
    ward: { type: String, trim: true },
    district: { type: String, trim: true },
    city: { type: String, trim: true },
    fullAddress: { type: String, trim: true },
    location: { type: pointSchema, _id: false },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    address: {
      type: addressSchema,
      required: false,
    },
    // Keep legacy location string for backward compatibility with old documents
    legacyAddress: {
      type: String,
      required: false,
      trim: true,
    },
    accountStatus: {
      type: String,
      enum: ["active", "locked"],
      default: "active",
    },
    lockedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Hash password before saving
customerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

const computeFullAddress = (address = {}) => {
  const parts = [address.street, address.ward, address.district, address.city]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.join(", ");
};

customerSchema.pre("save", function (next) {
  if (this.address) {
    const computed = computeFullAddress(this.address);
    if (computed && !this.address.fullAddress) {
      this.address.fullAddress = computed;
    }
  }
  next();
});

customerSchema.index({ "address.location": "2dsphere" });

// Compare plain text to hashed
customerSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("Customer", customerSchema);
