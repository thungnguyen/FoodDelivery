// Simple drone flight simulator for local testing.
// Usage:
//   npm run simulator:drones -- --orderId=abc123 --droneId=SIM-DRONE --hubId=HUB01 --interval=1800 --assignmentId=<optional>
// Default base URL: http://localhost:5010 (override via DRONE_API_BASE or DELIVERY_SERVICE_URL)
import fetch from 'node-fetch';

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const match = args.find((arg) => arg.startsWith(`--${name}=`));
  if (match) return match.split('=')[1];
  const flagIndex = args.indexOf(`--${name}`);
  if (flagIndex !== -1 && args[flagIndex + 1]) return args[flagIndex + 1];
  return fallback;
};

let orderId = getArg('orderId');
let droneId = getArg('droneId', 'SIM-DRONE');
let hubIdArg = getArg('hubId');
const assignmentId = getArg('assignmentId');
const intervalMs = Number(getArg('interval', 1800));
const baseArg = getArg('base');
const orderBaseArg = getArg('orderBase');

const BASE =
  baseArg ||
  process.env.SIM_BASE ||
  process.env.DRONE_API_BASE ||
  process.env.DELIVERY_SERVICE_URL ||
  'http://192.168.31.10:5003';
const ORDER_BASE =
  orderBaseArg ||
  process.env.SIM_ORDER_BASE ||
  process.env.ORDER_SERVICE_URL ||
  'http://192.168.31.10:5005';

const SPEED_MPS = 50; // 25 m/s
const TICK_MIN_MS = 3000;
const TICK_MAX_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const postJson = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

const sendUpdateLocation = (payload) =>
  postJson(`${BASE}/api/drone/update-location`, payload);

const appendTracking = (assignmentId, payload) => {
  // Ghi log để map realtime dùng: nếu có assignmentId thì gắn vào đơn, nếu không thì vẫn ghi tracking chung
  if (assignmentId) {
    return postJson(`${BASE}/api/drone-deliveries/${assignmentId}/logs`, payload);
  }
  return postJson(`${BASE}/api/drone/tracking`, payload);
};

const haversineKm = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad((b.lat || 0) - (a.lat || 0));
  const dLng = toRad((b.lng || 0) - (a.lng || 0));
  const lat1 = toRad(a.lat || 0);
  const lat2 = toRad(b.lat || 0);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const simulateSegment = async ({
  from,
  to,
  status,
  endStatus,
  orderId,
  hubId,
  droneId,
  assignmentId,
}) => {
  const distanceKm = haversineKm(from, to);
  const timeSec = (distanceKm * 1000) / SPEED_MPS;
  const tickMs = intervalMs || Math.max(TICK_MIN_MS, Math.min(TICK_MAX_MS, 4000));
  const steps = Math.max(1, Math.ceil((timeSec * 1000) / tickMs));

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    const isLast = i === steps;
    const stepStatus = isLast && endStatus ? endStatus : status;
    const payload = {
      droneId,
      lat,
      lng,
      status: stepStatus,
      currentOrderId: isLast && endStatus === 'idle' ? null : orderId,
      hubId,
    };
    await sendUpdateLocation(payload);
    await appendTracking(assignmentId, { assignmentId, orderId, droneId, lat, lng, status: stepStatus });
    await sleep(tickMs);
  }
};

const main = async () => {
  // Auto-pick order from queue if not provided
  if (!orderId) {
    try {
      const queue = await fetch(`${ORDER_BASE}/api/drone/orders-queue`).then((r) => r.json());
      const list = Array.isArray(queue?.data) ? queue.data : Array.isArray(queue) ? queue : [];
      const candidate = list.find(
        (o) => (o.droneStatus || o.status || '').toLowerCase() === 'waiting_for_drone'
      ) || list[0];
      if (!candidate) {
        console.error('[simulator] No orders in waiting_for_drone queue. Provide --orderId to simulate.');
        process.exit(1);
      }
      orderId = candidate._id || candidate.id || candidate.orderId;
      if (!hubIdArg) hubIdArg = candidate.droneHubId || candidate.hubId;
      if (!getArg('droneId') && candidate.droneId) droneId = candidate.droneId;
      console.log(`[simulator] Auto-picked order ${orderId} (hub ${hubIdArg || 'N/A'}, drone ${droneId})`);
    } catch (err) {
      console.error('[simulator] Failed to fetch order queue. Provide --orderId manually.', err?.message);
      process.exit(1);
    }
  }

  console.log(`[simulator] Starting for order ${orderId}, drone ${droneId}`);
  const routeResp = await postJson(`${BASE}/api/drone/auto-route`, {
    orderId,
    droneId,
    hubId: hubIdArg,
  });
  if (!routeResp.ok || !routeResp.data?.data?.waypoints?.length) {
    console.error('[simulator] Failed to fetch auto-route', routeResp.data || routeResp.status);
    process.exit(1);
  }
  const waypoints = routeResp.data.data.waypoints;
  const hubPoint = waypoints[0];
  const restaurantPoint = waypoints[1];
  const customerPoint = waypoints[2];
  const hubReturnPoint = waypoints[3] || hubPoint;

  console.log(`[simulator] Starting flight with speed ${SPEED_MPS} m/s and tick ~${intervalMs || 4000} ms`);
  await simulateSegment({
    from: hubPoint,
    to: restaurantPoint,
    status: 'drone_assigned',
    endStatus: 'drone_arriving_restaurant',
    orderId,
    hubId: hubIdArg || routeResp.data.data.hubId,
    droneId,
    assignmentId,
  });
  await simulateSegment({
    from: restaurantPoint,
    to: customerPoint,
    status: 'drone_arriving_customer',
    endStatus: 'drone_arriving_customer',
    orderId,
    hubId: hubIdArg || routeResp.data.data.hubId,
    droneId,
    assignmentId,
  });
  await simulateSegment({
    from: customerPoint,
    to: hubReturnPoint,
    status: 'returning',
    endStatus: 'idle',
    orderId,
    hubId: hubIdArg || routeResp.data.data.hubId,
    droneId,
    assignmentId,
  });
};

main().catch((err) => {
  console.error('[simulator] Unexpected error', err);
  process.exit(1);
});
