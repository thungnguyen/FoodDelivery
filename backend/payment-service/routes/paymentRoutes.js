const express = require("express");
const router = express.Router();
const Payment = require("../models/PaymentModel");
const crypto = require("crypto");
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeSecretKey ? require("stripe")(stripeSecretKey) : null;
require("dotenv").config();
const { sendSmsNotification } = require("../utils/twilioService"); // Import Twilio service

const normalizeCartItems = (cartItems = []) => {
  return cartItems
    .map((item) => {
      const rawRestaurant =
        item.restaurantId ||
        item.restaurant ||
        item.restaurant?._id ||
        item.restaurant?.id ||
        item.restaurant?.toString?.();
      const restaurantId =
        typeof rawRestaurant === "object"
          ? rawRestaurant?._id || rawRestaurant?.id || rawRestaurant?.toString?.()
          : rawRestaurant;
      const foodId = item.foodId || item.id || item._id;
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      if (!restaurantId || !foodId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price)) {
        return null;
      }
      return {
        foodId: foodId.toString(),
        foodName: item.foodName || item.name || "",
        restaurantId: restaurantId.toString(),
        restaurantName: item.restaurantName || item.restaurant?.name || "",
        quantity,
        price,
      };
    })
    .filter(Boolean);
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeShippingMap = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return Object.entries(value).reduce((acc, [restaurantId, fee]) => {
    const parsed = toNumber(fee, null);
    if (parsed !== null && parsed >= 0) {
      acc[restaurantId] = parsed;
    }
    return acc;
  }, {});
};

router.post("/process", async (req, res) => {
  try {
    const {
      orderId,
      userId,
      amount,
      currency,
      email,
      phone,
      customerName,
      deliveryAddress,
      cartItems = [],
      itemsTotal,
      shippingFee,
      totalPrice,
      perRestaurantShipping,
      metadata,
    } = req.body; 

    const normalizedPhone = typeof phone === "string" && phone.trim().length ? phone.trim() : "+1000000000";
    const normalizedEmail = typeof email === "string" && email.trim().length ? email.trim() : "unknown@example.com";
    const normalizedCartItems = normalizeCartItems(cartItems);
    if (!normalizedCartItems.length) {
      console.warn("[payment-service] Payment processed without valid cart snapshot");
    }
    if (!deliveryAddress) {
      console.warn("[payment-service] Payment processed without delivery address");
    }

    console.log(`Processing payment request for order ${orderId}`);

    // Check if a payment record already exists for this order.
    let payment = await Payment.findOne({ orderId });
    if (payment && payment.stripeClientSecret) {
      console.log("Existing Payment Found:", payment);
      if (payment.status === "Paid") {
        return res.status(200).json({
          message: "✅ This order has already been paid successfully.",
          paymentStatus: "Paid",
          disablePayment: true,
        });
      }
      // Return the existing client secret for a pending payment.
      return res.json({
        clientSecret: payment.stripeClientSecret,
        paymentId: payment._id,
        disablePayment: false,
      });
    }

    let paymentIntentId = null;
    let clientSecret = null;
    if (stripe) {
      const amountInCents = Math.round(parseFloat(amount) * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency || "usd",
        metadata: { orderId, userId },
        receipt_email: normalizedEmail,
      });
      console.log("✅ Created PaymentIntent:", paymentIntent);
      paymentIntentId = paymentIntent.id;
      clientSecret = paymentIntent.client_secret;
    } else {
      paymentIntentId = `pi_mock_${Date.now()}`;
      clientSecret = `pi_mock_secret_${crypto.randomUUID()}`;
      console.warn("[payment-service] STRIPE_SECRET_KEY missing. Using mock payment intent.");
    }

    // Create a new Payment record.
    payment = new Payment({
      orderId,
      userId,
      amount,
      currency: currency || "usd",
      status: "Pending",
      paymentMethod: "card",
      customerName,
      deliveryAddress,
      stripePaymentIntentId: paymentIntentId, // store only the id (without secret)
      stripeClientSecret: clientSecret, // store client secret for frontend
      phone: normalizedPhone,
      email: normalizedEmail,
      orderSnapshot: {
        cartItems: normalizedCartItems,
        itemsTotal: toNumber(itemsTotal, amount),
        shippingFee: toNumber(shippingFee, 0),
        totalPrice: toNumber(totalPrice, amount),
        deliveryAddress,
        customerName,
        perRestaurantShipping: normalizeShippingMap(perRestaurantShipping),
        metadata: metadata || {},
      },
    });
    await payment.save();
    console.log("Stored Payment Record:", payment);

    // Send SMS notification
    // const message = `Your payment of $${orderId} has been processed successfully.`;
    // await sendSmsNotification(phone, message);

    return res.json({
      clientSecret,
      paymentId: payment._id,
      disablePayment: false,
      mock: stripe ? false : true,
    });
  } catch (error) {
    // If duplicate key error occurs, recover gracefully.
    if (error.code === 11000) {
      let existingPayment = await Payment.findOne({ orderId: req.body.orderId });
      if (existingPayment) {
        console.log("⚠️ Duplicate detected; returning existing payment:", existingPayment);
        if (existingPayment.status === "Paid") {
          return res.status(200).json({
            message: "✅ This order has already been paid successfully.",
            paymentStatus: "Paid",
            disablePayment: true,
          });
        }
        return res.json({
          clientSecret: existingPayment.stripeClientSecret,
          paymentId: existingPayment._id,
          disablePayment: false,
        });
      }
      return res.status(500).json({ error: "Duplicate key error but no payment record found." });
    }
    console.error("❌ Stripe Payment processing error:", error.message);
    res.status(500).json({ error: "❌ Payment processing failed. Please try again." });
  }
});

module.exports = router;
