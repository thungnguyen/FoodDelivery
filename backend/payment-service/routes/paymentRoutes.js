const express = require("express");
const router = express.Router();
const Payment = require("../models/PaymentModel");
const crypto = require("crypto");
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeSecretKey ? require("stripe")(stripeSecretKey) : null;
require("dotenv").config();
const { sendSmsNotification } = require("../utils/twilioService"); // Import Twilio service

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

const MIN_PAYMENT_MINOR_UNITS = {
  usd: 50, // $0.50
  eur: 50, // €0.50
  gbp: 30, // £0.30
  sgd: 50, // $0.50 SGD
  vnd: 10000, // 10,000₫
};

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

const roundAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.round(num * 100) / 100;
};

const normalizeCurrency = (value) => {
  if (typeof value === "string" && value.trim().length) {
    return value.trim().toLowerCase();
  }
  return "usd";
};

const toMinorUnits = (amount, currency) => {
  const normalizedCurrency = normalizeCurrency(currency);
  const multiplier = ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) ? 1 : 100;
  return Math.round(amount * multiplier);
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

    const subtotalFromCart = normalizedCartItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0
    );
    const normalizedItemsTotal = roundAmount(toNumber(itemsTotal, subtotalFromCart));
    const normalizedShipping = roundAmount(Math.max(0, toNumber(shippingFee, 0)));
    const computedTotal = roundAmount(toNumber(totalPrice, normalizedItemsTotal + normalizedShipping));
    const clientAmount = roundAmount(toNumber(amount, computedTotal));
    const baselineAmount = computedTotal > 0 ? computedTotal : normalizedItemsTotal + normalizedShipping;
    const normalizedAmount = clientAmount > 0 ? Math.max(clientAmount, baselineAmount) : baselineAmount;

    if (!normalizedAmount || normalizedAmount <= 0) {
      return res.status(400).json({
        error: "Số tiền thanh toán không hợp lệ. Vui lòng kiểm tra lại giỏ hàng hoặc thử lại.",
      });
    }

    const normalizedCurrency = normalizeCurrency(currency || process.env.DEFAULT_PAYMENT_CURRENCY);
    const amountInMinorUnits = toMinorUnits(normalizedAmount, normalizedCurrency);
    const minimumMinor = MIN_PAYMENT_MINOR_UNITS[normalizedCurrency];
    if (minimumMinor && amountInMinorUnits < minimumMinor) {
      const divisor = ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) ? 1 : 100;
      const minimumDisplay = minimumMinor / divisor;
      return res.status(400).json({
        error: `Số tiền thanh toán thấp hơn mức tối thiểu (${minimumDisplay} ${normalizedCurrency.toUpperCase()}). Vui lòng thêm món hoặc chọn phương thức khác.`,
      });
    }

    console.log(`Processing payment request for order ${orderId}`);

    // Check if a payment record already exists for this order.
    let payment = await Payment.findOne({ orderId });
    if (payment && payment.stripeClientSecret) {
      console.log("Existing Payment Found:", payment);
      if (payment.status === "Paid" || payment.status === "Refunded") {
        return res.status(200).json({
          message:
            payment.status === "Refunded"
              ? "⚠️ This order has already been refunded."
              : "✅ This order has already been paid successfully.",
          paymentStatus: payment.status,
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
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInMinorUnits,
        currency: normalizedCurrency,
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
      amount: normalizedAmount,
      currency: normalizedCurrency,
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
        itemsTotal: normalizedItemsTotal,
        shippingFee: normalizedShipping,
        totalPrice: normalizedAmount,
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
        if (existingPayment.status === "Paid" || existingPayment.status === "Refunded") {
          return res.status(200).json({
            message:
              existingPayment.status === "Refunded"
                ? "⚠️ This order has already been refunded."
                : "✅ This order has already been paid successfully.",
            paymentStatus: existingPayment.status,
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
