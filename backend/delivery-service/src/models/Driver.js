import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleType: {
      type: String,
      required: true,
      trim: true,
    },
    licenseNumber: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    documents: [
      {
        label: String,
        url: String,
      },
    ],
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    status: {
      type: String,
      enum: ['offline', 'online', 'busy'],
      default: 'offline',
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
  },
  { timestamps: true }
);

const Driver = mongoose.model('Driver', driverSchema);

export default Driver;

