import Hub from '../models/Hub.js';
import emitEvent from '../utils/eventBus.js';

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:5005';
const RESTAURANT_SERVICE_URL = process.env.RESTAURANT_SERVICE_URL || 'http://localhost:5002';
const SERVICE_KEY = process.env.SERVICE_INTERNAL_KEY || 'super-admin-internal-key';

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

    const restaurantPoint =
      restaurant?.locationCoords && typeof restaurant.locationCoords.lat === 'number'
        ? { lat: restaurant.locationCoords.lat, lng: restaurant.locationCoords.lng, type: 'restaurant' }
        : null;
    const customerPoint =
      typeof order.deliveryLat === 'number' && typeof order.deliveryLng === 'number'
        ? { lat: order.deliveryLat, lng: order.deliveryLng, type: 'customer' }
        : null;
    const hubPoint =
      hub && typeof hub.location?.lat === 'number'
        ? { lat: hub.location.lat, lng: hub.location.lng, type: 'hub', id: hub._id.toString() }
        : null;

    if (!hubPoint || !restaurantPoint || !customerPoint) {
      return res
        .status(400)
        .json({
          message: 'Missing hub/restaurant/customer coordinates for auto-route',
          data: { hub: hubPoint, restaurant: restaurantPoint, customer: customerPoint },
        });
    }

    const MAX_DRONE_RADIUS_M = 4000;
    const distHubCustomer = haversineKm(hubPoint, customerPoint) * 1000;
    const distHubRestaurant = haversineKm(hubPoint, restaurantPoint) * 1000;
    if (distHubCustomer > MAX_DRONE_RADIUS_M) {
      return res.status(400).json({ message: 'Customer location is outside drone delivery radius' });
    }
    if (distHubRestaurant > MAX_DRONE_RADIUS_M) {
      return res.status(400).json({ message: 'Restaurant location is outside drone delivery radius' });
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

    return res.json({ data: { waypoints, distanceMeters, etaSeconds, hubId: hubPoint.id } });
  } catch (error) {
    console.error('[auto-route] failed', error);
    return res.status(500).json({ message: 'Failed to build auto-route' });
  }
};
