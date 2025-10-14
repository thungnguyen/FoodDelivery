import mongoose from "mongoose";

const deliverySchema = new mongoose.Schema({
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
    required: true
  },
  orderId: {
    type: String,
    required: true
  },
  customerId: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    default: ""
  },
  customerPhone: {
    type: String,
    default: ""
  },
  // Store the human-readable address separately
  pickupAddressString: {
    type: String,
    required: true
  },
  // GeoJSON format for location (must be exactly this structure)
  pickupLocation: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  deliveryAddressString: {
    type: String,
    required: true
  },
  deliveryLocation: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  status: {
    type: String,
    enum: ["assigned", "accepted", "picked_up", "out_for_delivery", "delivered", "failed", "cancelled"],
    default: "assigned"
  },
  restaurantId: {
    type: String,
    default: ""
  },
  restaurantName: {
    type: String,
    default: ""
  },
  orderTotal: {
    type: Number,
    default: 0
  },
  estimatedPayout: {
    type: Number,
    default: 0
  },
  statusHistory: [
    {
      status: { type: String, required: true },
      note: { type: String },
      timestamp: { type: Date, default: Date.now }
    }
  ],
  distanceKm: {
    type: Number,
    default: 0
  },
  baseFare: {
    type: Number,
    default: 0
  },
  distanceFare: {
    type: Number,
    default: 0
  },
  bonus: {
    type: Number,
    default: 0
  },
  tipAmount: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  failureReason: {
    type: String,
    default: ""
  }
}, { timestamps: true });

// Create the geospatial index on the proper GeoJSON field
deliverySchema.index({ "pickupLocation": "2dsphere" });

const Delivery = mongoose.model("Delivery", deliverySchema);

export default Delivery;
