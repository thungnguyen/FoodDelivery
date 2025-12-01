import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      validate: {
        validator: (val) => Array.isArray(val) && val.length === 2,
        message: 'Coordinates must be [lng, lat]',
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

const restaurantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    taxCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    ownerName: {
      type: String,
      required: true,
    },
    address: {
      type: addressSchema,
      required: false,
    },
    // keep legacyLocation for backward compatibility with existing documents
    legacyLocation: {
      type: String,
      trim: true,
    },
    // Expose lat/lng for clients that still consume this shape (derived from address.location)
    locationCoords: {
      lat: { type: Number },
      lng: { type: Number },
    },
    contactNumber: {
      type: String,
      required: true,
    },
    profilePicture: {
      type: String,
      default: '',
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvalNotes: {
      type: String,
    },
    approvedAt: {
      type: Date,
    },
    rejectedAt: {
      type: Date,
    },
    lastReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuperAdmin',
    },
    onboardingEmailSentAt: {
      type: Date,
    },
    onboardingOtpHash: {
      type: String,
    },
    onboardingOtpExpiresAt: {
      type: Date,
    },
    onboardingOtpVerifiedAt: {
      type: Date,
    },
    onboardingPasswordMustChange: {
      type: Boolean,
      default: true,
    },
    admin: {
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },
      password: {
        type: String,
        default: '',
      },
    },
    availability: {
      type: Boolean,
      default: false,
    },
    bankAccountNumber: {
      type: String,
      trim: true,
      default: '',
    },
    bankAccountName: {
      type: String,
      trim: true,
      default: '',
    },
    bankName: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const computeFullAddress = (address = {}) => {
  const parts = [address.street, address.ward, address.district, address.city]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
};

// Hash the password before saving the restaurant document
restaurantSchema.pre('save', async function (next) {
  if (this.isModified('admin.password')) {
    const rawPassword = this.admin.password;
    if (typeof rawPassword === 'string' && rawPassword.trim().length) {
      const salt = await bcrypt.genSalt(10);
      this.admin.password = await bcrypt.hash(rawPassword, salt);
    } else {
      this.admin.password = '';
    }
  }
  next();
});

restaurantSchema.pre('save', function (next) {
  if (this.address) {
    const computedFull = computeFullAddress(this.address);
    if (computedFull && !this.address.fullAddress) {
      this.address.fullAddress = computedFull;
    }

    const coords = this.address.location?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      this.locationCoords = {
        lat: Number(coords[1]),
        lng: Number(coords[0]),
      };
    }
  } else if (!this.address && this.locationCoords?.lat && this.locationCoords?.lng) {
    this.address = {
      location: {
        type: 'Point',
        coordinates: [Number(this.locationCoords.lng), Number(this.locationCoords.lat)],
      },
      fullAddress: this.legacyLocation || '',
    };
  }
  next();
});

restaurantSchema.virtual('location').get(function () {
  return this.address?.fullAddress || this.legacyLocation || '';
});

restaurantSchema.index({ 'address.location': '2dsphere' });

// Method to compare password for login
restaurantSchema.methods.compareAdminPassword = async function (password) {
  if (!this.admin?.password || !this.admin.password.trim().length) {
    return false;
  }
  return bcrypt.compare(password, this.admin.password);
};

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;
