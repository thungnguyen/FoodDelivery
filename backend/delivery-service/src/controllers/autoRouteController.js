import mongoose from 'mongoose';
import Hub from '../models/Hub.js';
import Drone from '../models/Drone.js';
import DroneDelivery from '../models/DroneDelivery.js';
import emitEvent from '../utils/eventBus.js';
import { normalizeBaseUrl } from '../utils/url.js';
import fetch from 'node-fetch';

const ORDER_SERVICE_URL = normalizeBaseUrl(process.env.ORDER_SERVICE_URL, 'http://26.32.188.49:5005', [
  '/api/orders',
  '/api',
]);
const RESTAURANT_SERVICE_URL = normalizeBaseUrl(
  process.env.RESTAURANT_SERVICE_URL,
  'http://26.32.188.49:5002',
  ['/api/restaurants', '/api']
);
const SERVICE_KEY = process.env.SERVICE_INTERNAL_KEY || 'super-admin-internal-key';
const DELIVERY_BASE_URL = normalizeBaseUrl(process.env.DELIVERY_SERVICE_URL, 'http://26.32.188.49:5010', ['/api']);

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

const isLatLngInVietnam = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110;

const normalisePoint = (point, fallbackType) => {
  if (!point) return null;
  let { lat, lng } = point;
  // Detect swapped coords (lat in 102-110 and lng in 8-24) and flip
  if (!isLatLngInVietnam(lat, lng) && isLatLngInVietnam(lng, lat)) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, type: point.type || fallbackType, label: point.label || point.name };
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
    const { orderId, droneId: rawDroneId, hubId } = req.body || {};
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

    let restaurantPoint = normalisePoint(
      toPoint(restaurant?.locationCoords?.lat, restaurant?.locationCoords?.lng, 'restaurant') ||
        toPoint(restaurant?.address?.location?.coordinates?.[1], restaurant?.address?.location?.coordinates?.[0], 'restaurant'),
      'restaurant'
    );
    let customerPoint = normalisePoint(
      toPoint(order?.deliveryLat, order?.deliveryLng, 'customer') ||
        toPoint(order?.deliveryLocation?.lat, order?.deliveryLocation?.lng, 'customer') ||
        toPoint(order?.deliveryLocation?.coordinates?.[1], order?.deliveryLocation?.coordinates?.[0], 'customer'),
      'customer'
    );
    let hubPoint = normalisePoint(toPoint(hub?.location?.lat, hub?.location?.lng, 'hub'), 'hub');

    if (hubPoint) hubPoint.label = hub?.name || hub?.code || 'Hub';
    if (restaurantPoint) restaurantPoint.label = restaurant?.name || restaurant?.restaurantName || 'Nhà hàng';
    if (customerPoint) customerPoint.label = order?.customerName || order?.deliveryAddress || 'Khách hàng';

    // Nếu vẫn chưa có toạ độ hợp lệ, thử geocode lại bằng địa chỉ (đảm bảo không bị đảo lat/lng)
    if ((!customerPoint || !isLatLngInVietnam(customerPoint.lat, customerPoint.lng)) && order?.deliveryAddress) {
      const geo = await fetchJson(`${ORDER_SERVICE_URL}/api/geocode?q=${encodeURIComponent(order.deliveryAddress)}`);
      const coords = geo?.data;
      if (coords?.lat && coords?.lng) {
        customerPoint = normalisePoint(toPoint(coords.lat, coords.lng, 'customer'), 'customer');
      }
    }
    if ((!restaurantPoint || !isLatLngInVietnam(restaurantPoint.lat, restaurantPoint.lng)) && restaurant?.address?.fullAddress) {
      const geo = await fetchJson(`${RESTAURANT_SERVICE_URL}/api/geocode?q=${encodeURIComponent(restaurant.address.fullAddress)}`);
      const coords = geo?.data;
      if (coords?.lat && coords?.lng) {
        restaurantPoint = normalisePoint(toPoint(coords.lat, coords.lng, 'restaurant'), 'restaurant');
      }
    }
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

    const hubIdValue = hub?._id?.toString?.() || hubPoint.id || hubId;

    // Resolve droneId to ObjectId if possible (keeps link khi simulator gửi mã drone)
    let resolvedDroneId = undefined;
    if (rawDroneId) {
      if (mongoose.isValidObjectId(rawDroneId)) {
        resolvedDroneId = rawDroneId;
      } else {
        const droneDoc = await Drone.findOne({
          $or: [{ code: rawDroneId.toString().toUpperCase() }, { droneId: rawDroneId.toString() }],
        }).select('_id');
        resolvedDroneId = droneDoc?._id;
      }
    }

    // Persist a lightweight assignment so FE luôn có waypoint để vẽ tuyến
    let assignmentId = null;
    try {
      const normalizedWaypoints = waypoints
        .map((wp, idx) =>
          normalisePoint(
            {
              lat: wp.lat,
              lng: wp.lng,
              type:
                wp.type ||
                (idx === 0 || idx === waypoints.length - 1 ? 'HUB' : idx === 1 ? 'RESTAURANT' : 'CUSTOMER'),
              label: wp.label,
              name: wp.name,
            },
            idx === 0 || idx === waypoints.length - 1 ? 'HUB' : idx === 1 ? 'RESTAURANT' : 'CUSTOMER'
          )
        )
        .filter(Boolean)
        .map((pt) => ({
          lat: pt.lat,
          lng: pt.lng,
          type: pt.type?.toString().toUpperCase(),
          label: pt.label || pt.name,
        }));

      const update = {
        route: {
          provider: 'custom',
          waypoints: normalizedWaypoints,
          distance: distanceMeters,
          duration: etaSeconds,
        },
        hubId: mongoose.isValidObjectId(hubIdValue) ? hubIdValue : undefined,
        restaurantId,
        customerId: order?.customerId,
        status: 'TAKEOFF',
      };
      if (resolvedDroneId) {
        update.droneId = resolvedDroneId;
      }

      const delivery = await DroneDelivery.findOneAndUpdate(
        { orderId },
        { $set: update, $setOnInsert: { orderId, ...update } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      assignmentId = delivery?._id;
    } catch (persistErr) {
      console.warn('[auto-route] failed to persist delivery route', persistErr?.message);
    }

    emitEvent({
      event: 'order_auto_route_loaded',
      payload: {
        orderId,
        assignmentId,
        droneId: rawDroneId,
        droneDbId: resolvedDroneId,
        hubId: hubIdValue,
        restaurantId,
        customerId: order?.customerId,
        waypoints,
        distanceMeters,
        etaSeconds,
        restaurantLocation: restaurantPoint,
        customerLocation: customerPoint,
        hubLocation: hubPoint,
      },
      broadcast: true,
    });

    // Chỉ simulate khi được yêu cầu rõ ràng (tránh tự động bay khi nhà hàng bấm chờ)
    const shouldSimulate = req.body?.simulate === true || req.query?.simulate === 'true';
    if (shouldSimulate && rawDroneId) {
      simulateFlight({ droneId: rawDroneId, orderId, hubId: hubIdValue, waypoints });
    }

    return res.json({
      data: {
        assignmentId,
        waypoints,
        distanceMeters,
        etaSeconds,
        hubId: hubIdValue,
        droneId: rawDroneId,
        droneDbId: resolvedDroneId,
        restaurantId,
        customerId: order?.customerId,
        restaurantLocation: restaurantPoint,
        customerLocation: customerPoint,
      },
    });
  } catch (error) {
    console.error('[auto-route] failed', error);
    return res.status(500).json({ message: 'Failed to build auto-route' });
  }
};
