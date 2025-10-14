import axios from "axios";
import jwt from "jsonwebtoken";

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://localhost:5005/api/orders";

const ORDER_SERVICE_JWT_SECRET =
  process.env.ORDER_SERVICE_JWT_SECRET ||
  process.env.SHARED_JWT_SECRET ||
  "CNPM2025";

const signDriverToken = (driverId) => {
  const secret = ORDER_SERVICE_JWT_SECRET;
  return jwt.sign(
    {
      id: driverId,
      driverId,
      role: "driver",
    },
    secret,
    {
      expiresIn: "15m",
    }
  );
};

export const updateOrderStatus = async (orderId, driverId, status) => {
  try {
    if (!orderId || !status) return;

    const token = signDriverToken(driverId);
    const url = `${ORDER_SERVICE_URL}/${orderId}/status`;

    await axios.patch(
      url,
      { status },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 10_000,
      }
    );
  } catch (error) {
    console.error(
      `⚠️ Failed to sync order ${orderId} status -> ${status}:`,
      error.response?.data || error.message
    );
  }
};

export const fetchAwaitingOrders = async (driverId) => {
  try {
    const token = signDriverToken(driverId);
    const response = await axios.get(ORDER_SERVICE_URL, {
      headers: { Authorization: `Bearer ${token}` },
      params: { status: "Awaiting Driver" },
      timeout: 10_000,
    });
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error(
      "⚠️ Failed to fetch awaiting driver orders:",
      error.response?.data || error.message
    );
    return [];
  }
};
