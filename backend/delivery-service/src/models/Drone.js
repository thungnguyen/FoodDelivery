import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, default: 0 },
    lng: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const droneSchema = new mongoose.Schema(
  {
    droneId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    battery: {
      type: Number,
      default: 100,
    },
    status: {
      type: String,
      enum: [
        'idle',
        'assigned',
        'enroute_to_restaurant',
        'picking',
        'delivering',
        'returning',
        'offline',
      ],
      default: 'idle',
    },
    location: {
      type: locationSchema,
      default: () => ({ lat: 0, lng: 0 }),
    },
    hubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: false,
    },
    currentOrderId: {
      type: String,
      required: false,
      trim: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

droneSchema.index({ droneId: 1 }, { unique: true });

const Drone = mongoose.model('Drone', droneSchema);

export default Drone;
