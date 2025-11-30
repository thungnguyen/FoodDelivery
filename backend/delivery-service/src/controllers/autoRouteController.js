import Hub from '../models/Hub.js';
import emitEvent from '../utils/eventBus.js';
import { normalizeBaseUrl } from '../utils/url.js';
import fetch from 'node-fetch';

const ORDER_SERVICE_URL = normalizeBaseUrl(process.env.ORDER_SERVICE_URL, 'http://localhost:5005', [
  '/api/orders',
  '/api',
]);
const RESTAURANT_SERVICE_URL = normalizeBaseUrl(
  process.env.RESTAURANT_SERVICE_URL,
  'http://localhost:5002',
  ['/api/restaurants', '/api']
);
const SERVICE_KEY = process.env.SERVICE_INTERNAL_KEY || 'super-admin-internal-key';
const DELIVERY_BASE_URL = normalizeBaseUrl(process.env.DELIVERY_SERVICE_URL, 'http://localhost:5010', ['/api']);

const fetchJson = async (url) => {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-service-key': SERVICE_KEY,
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

const haversineKm = (a, b) => {
  if (!a || !b || typeof a.lat !== 'number' || typeof a.lng !== 'number') return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aa = sinLat * sinLat + sinLng * sinLng * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
};

const accumulateDistanceKm = (waypoints) => {
  let dist = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    dist += haversineKm(waypoints[i], waypoints[i + 1]);
  }
  return Math.round(dist * 100) / 100;
};

const toPoint = (lat, lng, type) => {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  return { lat: nLat, lng: nLng, type };
};

const simulateFlight = async ({ droneId, orderId, hubId, waypoints }) => {
  if (!droneId || !Array.isArray(waypoints) || waypoints.length === 0) return;
  const delayMs = 1800;
  const postLocation = async (wp, status) => {
    try {
      await fetch(`${DELIVERY_BASE_URL}/api/drone/update-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          droneId,
          lat: wp.lat,
          lng: wp.lng,
          status,
          currentOrderId: orderId,
          hubId,
        }),
      });
    } catch (err) {
      console.warn('[auto-route] simulateFlight failed', err?.message);
    }
  };

  waypoints.forEach((wp, index) => {
    setTimeout(() => {
      let status = 'drone_enroute_to_restaurant';
      if (wp.type?.toLowerCase() === 'restaurant') status = index === 1 ? 'drone_arrived_restaurant' : 'drone_delivering';
      if (wp.type?.toLowerCase() === 'customer') status = 'drone_arrived_customer';
      if (index === waypoints.length - 1) status = 'returning';
      postLocation(wp, status);
      if (index === waypoints.length - 1) {
        setTimeout(() => {
          // clear current order when đã về hub
          postLocation({ ...wp, orderId: null }, 'idle');
        }, delayMs);
      }
    }, index * delayMs);
  });
};

export const generateAutoRoute = async (req, res) => {
  try {
    const { orderId, droneId, hubId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ message: 'orderId is required' });
    }

    let orderResp = await fetchJson(`${ORDER_SERVICE_URL}/api/orders/${orderId}`);
    let order = orderResp.data;
    if (!orderResp.ok || !order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const restaurantId = order.restaurantId;
    let restaurantResp = restaurantId
      ? await fetchJson(`${RESTAURANT_SERVICE_URL}/api/restaurants/${restaurantId}`)
      : { ok: false };
    let restaurant = restaurantResp.data;

    // Try geocode order/restaurant if missing coordinates
    if ((!order?.deliveryLat || !order?.deliveryLng) && orderId) {
      await fetchJson(`${ORDER_SERVICE_URL}/api/orders/${orderId}/geocode`);
      orderResp = await fetchJson(`${ORDER_SERVICE_URL}/api/orders/${orderId}`);
      order = orderResp.data;
    }
    if (restaurantId && (!restaurant?.locationCoords?.lat || !restaurant?.locationCoords?.lng)) {
      await fetchJson(`${RESTAURANT_SERVICE_URL}/api/restaurants/${restaurantId}/geocode`);
      restaurantResp = await fetchJson(`${RESTAURANT_SERVICE_URL}/api/restaurants/${restaurantId}`);
      restaurant = restaurantResp.data;
    }

    const hub = hubId ? await Hub.findById(hubId) : await Hub.findOne();

    let restaurantPoint =
      toPoint(restaurant?.locationCoords?.lat, restaurant?.locationCoords?.lng, 'restaurant') ||
      toPoint(restaurant?.address?.location?.coordinates?.[1], restaurant?.address?.location?.coordinates?.[0], 'restaurant');
    let customerPoint =
      toPoint(order?.deliveryLat, order?.deliveryLng, 'customer') ||
      toPoint(order?.deliveryLocation?.lat, order?.deliveryLocation?.lng, 'customer') ||
      toPoint(order?.deliveryLocation?.coordinates?.[1], order?.deliveryLocation?.coordinates?.[0], 'customer');
    let hubPoint = toPoint(hub?.location?.lat, hub?.location?.lng, 'hub');
    if (hubPoint && hub?._id) {
      hubPoint.id = hub._id.toString();
    }

    // Fallbacks to avoid missing coordinates
    if (!hubPoint && restaurantPoint) {
      hubPoint = { ...restaurantPoint, type: 'hub', id: hub?._id?.toString() || 'fallback-hub' };
    } else if (!hubPoint && customerPoint) {
      hubPoint = { ...customerPoint, type: 'hub', id: hub?._id?.toString() || 'fallback-hub' };
    }
    if (!restaurantPoint && hubPoint) {
      restaurantPoint = { ...hubPoint, type: 'restaurant' };
    }
    if (!customerPoint && restaurantPoint) {
      customerPoint = { ...restaurantPoint, type: 'customer' };
    } else if (!customerPoint && hubPoint) {
      customerPoint = { ...hubPoint, type: 'customer' };
    }

    if (!hubPoint || !restaurantPoint || !customerPoint) {
      // Fallback: duplicate whatever coords we have so route vẫn tạo được
      const anyPoint = hubPoint || restaurantPoint || customerPoint;
      const safe = anyPoint || { lat: 0, lng: 0 };
      hubPoint = hubPoint || { ...safe, type: 'hub', id: hub?._id?.toString() || 'fallback-hub' };
      restaurantPoint = restaurantPoint || { ...safe, type: 'restaurant' };
      customerPoint = customerPoint || { ...safe, type: 'customer' };
    }

    // Cho phép phạm vi rộng hơn (50km từ hub)
    const MAX_DRONE_RADIUS_M = 50_000;
    const distHubCustomer = haversineKm(hubPoint, customerPoint) * 1000;
    const distHubRestaurant = haversineKm(hubPoint, restaurantPoint) * 1000;
    if (distHubCustomer > MAX_DRONE_RADIUS_M || distHubRestaurant > MAX_DRONE_RADIUS_M) {
      console.warn('[auto-route] outside 50km radius, vẫn tiếp tục dựng tuyến');
    }

    const waypoints = [hubPoint, restaurantPoint, customerPoint, hubPoint];
    const distanceKm = accumulateDistanceKm(waypoints);
    const distanceMeters = Math.round(distanceKm * 1000);
    const etaSeconds = Math.round((distanceKm / 30) * 3600); // assume 30km/h

    emitEvent({
      event: 'order_auto_route_loaded',
      payload: { orderId, droneId, waypoints, distanceMeters, etaSeconds },
      broadcast: true,
    });

    // Kick off a simple simulation so map có chuyển động realtime
    if (droneId) {
      simulateFlight({ droneId, orderId, hubId: hubPoint.id, waypoints });
    }

    return res.json({ data: { waypoints, distanceMeters, etaSeconds, hubId: hubPoint.id } });
  } catch (error) {
    console.error('[auto-route] failed', error);
    return res.status(500).json({ message: 'Failed to build auto-route' });
  }
};
