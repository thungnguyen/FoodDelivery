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

const droneTrackingLogSchema = new mongoose.Schema(
  {
    droneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Drone', required: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DroneDelivery' },
    timestamp: { type: Date, default: Date.now },
    location: { type: pointSchema, required: true },
    altitudeMeters: { type: Number },
    speedMps: { type: Number },
    batteryLevel: { type: Number },
    extra: { type: mongoose.Schema.Types.Mixed },
  },
  { collection: 'drone_tracking_logs' }
);

droneTrackingLogSchema.index({ location: '2dsphere' });
droneTrackingLogSchema.index({ droneId: 1, timestamp: -1 });

const DroneTrackingLog = mongoose.model('DroneTrackingLog', droneTrackingLogSchema);

export default DroneTrackingLog;
