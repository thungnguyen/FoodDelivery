import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Restaurant Schema
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
    location: {
      type: String,
      required: true, 
    },
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
  { timestamps: true }
);

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

// Method to compare password for login
restaurantSchema.methods.compareAdminPassword = async function (password) {
  if (!this.admin?.password || !this.admin.password.trim().length) {
    return false;
  }
  return bcrypt.compare(password, this.admin.password);
};

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;
