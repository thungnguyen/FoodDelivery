const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    foodId: { type: String, required: true },
    foodName: { type: String },
    restaurantId: { type: String, required: true },
    restaurantName: { type: String },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
  },
  { _id: false }
);

const PaymentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true }, // Unique per order
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "usd" },
  status: {
    type: String,
    enum: ["Pending", "Paid", "Failed"],
    default: "Pending",
  },
  paymentMethod: {
    type: String,
    enum: ["card", "cash", "vietqr"],
    default: "card",
  },
  customerName: { type: String },
  deliveryAddress: { type: String },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  orderSnapshot: {
    cartItems: { type: [CartItemSchema], default: [] },
    itemsTotal: { type: Number },
    shippingFee: { type: Number },
    totalPrice: { type: Number },
    perRestaurantShipping: { type: Map, of: Number },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  // Save the PaymentIntent id (e.g. "pi_3R9OXlD3879aJGnP0xfO1oMm")
  stripePaymentIntentId: { type: String, unique: true, sparse: true },
  // Also save the client secret (e.g. "pi_3R9OXlD3879aJGnP0xfO1oMm_secret_...")
  stripeClientSecret: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update updatedAt on save.
PaymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Payment", PaymentSchema);
