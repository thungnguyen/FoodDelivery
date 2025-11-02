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

export const fetchOrdersByIds = async (orderIds = [], driverId) => {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return {};
  }

  const uniqueIds = Array.from(
    new Set(
      orderIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length)
    )
  );
  if (uniqueIds.length === 0) {
    return {};
  }

  const token = signDriverToken(driverId || "driver-service");
  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const response = await axios.get(`${ORDER_SERVICE_URL}/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10_000,
        });
        if (response.data) {
          return [id, response.data];
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to fetch order ${id} for delivery enrichment:`,
          error.response?.data || error.message
        );
      }
      return null;
    })
  );

  return results.reduce((acc, entry) => {
    if (entry) {
      acc[entry[0]] = entry[1];
    }
    return acc;
  }, {});
};
