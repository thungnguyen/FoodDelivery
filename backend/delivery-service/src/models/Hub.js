import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      validate: { validator: (val) => Array.isArray(val) && val.length === 2, message: 'Coordinates must be [lng, lat]' },
    },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, default: 0 },
    lng: { type: Number, required: true, default: 0 },
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

const computeFullAddress = (address = {}) => {
  const parts = [address.street, address.ward, address.district, address.city]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
};

const hubSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    address: {
      type: addressSchema,
      required: false,
    },
    // keep legacy lat/lng for backward compatibility
    location: {
      type: locationSchema,
      required: false,
      default: () => ({ lat: 0, lng: 0 }),
    },
    radiusKm: {
      type: Number,
      required: false,
      default: 5,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, collection: 'drone_hubs' }
);

hubSchema.pre('save', function (next) {
  if (!this.code && this.name) {
    this.code = this.name.replace(/\s+/g, '-').toUpperCase();
  }
  if (this.address) {
    const full = this.address.fullAddress || computeFullAddress(this.address);
    if (full) {
      this.address.fullAddress = full;
    }
    if (this.address.location?.coordinates?.length === 2) {
      this.location = {
        lat: Number(this.address.location.coordinates[1]),
        lng: Number(this.address.location.coordinates[0]),
      };
    }
  }
  next();
});

hubSchema.index({ code: 1 }, { unique: true });
hubSchema.index({ 'address.location': '2dsphere' });

const Hub = mongoose.model('Hub', hubSchema);

export default Hub;

