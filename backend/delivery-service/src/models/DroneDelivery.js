import mongoose from 'mongoose';

const waypointSchema = new mongoose.Schema(
  {
    lng: { type: Number, required: true },
    lat: { type: Number, required: true },
    type: { type: String, enum: ['HUB', 'RESTAURANT', 'CUSTOMER'], required: true },
  },
  { _id: false }
);

const routeSchema = new mongoose.Schema(
  {
    waypoints: [waypointSchema],
    provider: {
      type: String,
      enum: ['openrouteservice', 'custom'],
      default: 'openrouteservice',
    },
    geometry: {
      type: [[Number]],
    },
    distance: Number,
    duration: Number,
  },
  { _id: false }
);

const droneDeliverySchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.Mixed, required: true },
    droneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Drone' },
    hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hub' },
    customerId: { type: mongoose.Schema.Types.Mixed },
    restaurantId: { type: mongoose.Schema.Types.Mixed },
    route: routeSchema,
    status: {
      type: String,
      enum: [
        'PENDING',
        'ASSIGNED',
        'TAKEOFF',
        'EN_ROUTE_TO_RESTAURANT',
        'EN_ROUTE_TO_CUSTOMER',
        'DELIVERED',
        'RETURNING',
        'COMPLETED',
        'CANCELLED',
        'FAILED',
      ],
      default: 'PENDING',
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: 'drone_deliveries' }
);

droneDeliverySchema.index({ orderId: 1 });
droneDeliverySchema.index({ droneId: 1 });
droneDeliverySchema.index({ hubId: 1 });

const DroneDelivery = mongoose.model('DroneDelivery', droneDeliverySchema);

export default DroneDelivery;
