import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, default: 0 },
    lng: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

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

const maintenanceLogSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    type: { type: String, trim: true },
    note: { type: String, trim: true },
    technician: { type: String, trim: true },
  },
  { _id: false }
);

const droneSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    droneId: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    batteryLevel: {
      type: Number,
      default: 100,
    },
    battery: {
      type: Number,
      default: 100,
    },
    status: {
      type: String,
      enum: [
        'IDLE',
        'DRONE_ASSIGNED',
        'DRONE_ARRIVING_RESTAURANT',
        'DRONE_PICKED_FOOD',
        'DRONE_ARRIVING_CUSTOMER',
        'RETURNING',
        'CHARGING',
        'MAINTENANCE',
        'IN_REPAIR',
        'RETIRED',
        'OFFLINE',
        'PENDING',
        'TAKEOFF',
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'FAILED',
        // Legacy/aliases
        'ASSIGNED',
        'IN_FLIGHT',
        'EN_ROUTE_TO_RESTAURANT',
        'EN_ROUTE_TO_CUSTOMER',
        'offline',
        'idle',
        'assigned',
        'enroute_to_restaurant',
        'picking',
        'delivering',
        'returning',
      ],
      default: 'IDLE',
    },
    currentLocation: {
      type: pointSchema,
    },
    // Legacy lat/lng shape for backward compatibility
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
    maxPayloadKg: {
      type: Number,
    },
    lastHeartbeatAt: {
      type: Date,
    },
    maintenanceStatus: {
      type: String,
      enum: ['OK', 'NEEDS_CHECK', 'IN_SERVICE'],
      default: 'OK',
    },
    maintenanceLogs: [maintenanceLogSchema],
    nextMaintenanceDueAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

droneSchema.pre('save', function (next) {
  if (!this.code && this.droneId) {
    this.code = String(this.droneId).toUpperCase();
  }
  if (!this.droneId && this.code) {
    this.droneId = this.code;
  }
  if (!this.name) {
    this.name = this.code || this.droneId;
  }
  if (this.currentLocation?.coordinates?.length === 2) {
    this.location = {
      lat: Number(this.currentLocation.coordinates[1]),
      lng: Number(this.currentLocation.coordinates[0]),
    };
  } else if (this.location?.lat && this.location?.lng && !this.currentLocation) {
    this.currentLocation = {
      type: 'Point',
      coordinates: [Number(this.location.lng), Number(this.location.lat)],
    };
  }
  this.battery = typeof this.batteryLevel === 'number' ? this.batteryLevel : this.battery;
  this.batteryLevel = typeof this.battery === 'number' ? this.battery : this.batteryLevel;
  next();
});

droneSchema.index({ code: 1 }, { unique: true });
droneSchema.index({ droneId: 1 });
droneSchema.index({ currentLocation: '2dsphere' });
droneSchema.index({ hubId: 1, status: 1 });

const Drone = mongoose.model('Drone', droneSchema);

export default Drone;
