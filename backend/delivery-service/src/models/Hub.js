import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, default: 0 },
    lng: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const hubSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: locationSchema,
      required: true,
      default: () => ({ lat: 0, lng: 0 }),
    },
    radiusKm: {
      type: Number,
      required: true,
      default: 5,
    },
  },
  { timestamps: true }
);

const Hub = mongoose.model('Hub', hubSchema);

export default Hub;

