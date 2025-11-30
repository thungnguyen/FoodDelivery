import mongoose from 'mongoose';
import Drone from '../models/Drone.js';
import Hub from '../models/Hub.js';
import DroneDelivery from '../models/DroneDelivery.js';
import DroneTrackingLog from '../models/DroneTrackingLog.js';
import { emitDroneLocation } from '../realtime/droneSocket.js';
import emitEvent from '../utils/eventBus.js';
import { getRouteFromORS } from '../services/droneRoutingService.js';
import fetch from 'node-fetch';

const OFFLINE_THRESHOLD_MS = Number.MAX_SAFE_INTEGER; // keep drones online in demo
const DRONE_STATUSES = [
  'IDLE',
  'DRONE_ASSIGNED',
  'DRONE_ARRIVING_RESTAURANT',
  'DRONE_PICKED_FOOD',
  'DRONE_ARRIVING_CUSTOMER',
  'RETURNING',
  'CHARGING',
  'MAINTENANCE',
  'OFFLINE',
  'ASSIGNED',
  'IN_FLIGHT',
  'MAINTENANCE',
  'IN_REPAIR',
  'RETIRED',
  'OFFLINE',
  'PENDING',
  'TAKEOFF',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
  'EN_ROUTE_TO_RESTAURANT',
  'EN_ROUTE_TO_CUSTOMER',
  'RETURNING',
];

const DELIVERY_STATUSES = [
  'PENDING',
  'ASSIGNED',
  'TAKEOFF',
  'EN_ROUTE_TO_RESTAURANT',
  'EN_ROUTE_TO_CUSTOMER',
  'DELIVERED',
  'RETURNING',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
];

const computeFullAddress = (address = {}) => {
  const parts = [address.street, address.ward, address.district, address.city]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
};

const normaliseStatus = (status, allowed = []) => {
  if (!status || typeof status !== 'string') return null;
  const upper = status.trim().toUpperCase();
  if (allowed.includes(upper)) return upper;
  return null;
};

const parseCoordinates = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw) && raw.length === 2) {
    const lng = Number(raw[0]);
    const lat = Number(raw[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
    return null;
  }
  if (typeof raw === 'object') {
    const lat = Number(raw.lat ?? raw.latitude);
    const lng = Number(raw.lng ?? raw.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
  }
  return null;
};

const toGeoPoint = (payload) => {
  const coordinates =
    parseCoordinates(payload?.coordinates) ||
    parseCoordinates(payload?.location?.coordinates) ||
    parseCoordinates(payload?.location) ||
    parseCoordinates(payload);

  if (!coordinates) return null;
  return { type: 'Point', coordinates };
};

const formatLocation = (drone) => {
  const coords = drone.currentLocation?.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    return { lng: coords[0], lat: coords[1] };
  }
  if (drone.location?.lng !== undefined && drone.location?.lat !== undefined) {
    return { lng: drone.location.lng, lat: drone.location.lat };
  }
  return undefined;
};

const safeFetchJson = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch (_err) {
    return null;
  }
};

const formatDrone = (drone) => ({
  id: drone._id,
  code: drone.code,
  droneId: drone.droneId,
  name: drone.name,
  battery: typeof drone.batteryLevel === 'number' ? drone.batteryLevel : drone.battery,
  batteryLevel: typeof drone.batteryLevel === 'number' ? drone.batteryLevel : drone.battery,
  status: drone.status ? drone.status.toString().toUpperCase() : undefined,
  hubId: drone.hubId,
  currentOrderId: drone.currentOrderId,
  currentLocation: formatLocation(drone),
  maxPayloadKg: drone.maxPayloadKg,
  maintenanceStatus: drone.maintenanceStatus,
  nextMaintenanceDueAt: drone.nextMaintenanceDueAt,
  lastHeartbeatAt: drone.lastHeartbeatAt,
  maintenanceLogs: drone.maintenanceLogs,
  updatedAt: drone.updatedAt,
});

const buildIdFilter = (id, key = 'droneId') => {
  const filters = [];
  if (mongoose.isValidObjectId(id)) {
    filters.push({ _id: id });
  }
  if (key) {
    filters.push({ [key]: id });
  }
  if (key === 'droneId') {
    filters.push({ code: String(id).toUpperCase() });
  }
  if (filters.length === 1) return filters[0];
  return { $or: filters };
};

const buildHubAddress = (payload = {}) => {
  const addressInput = payload.address && typeof payload.address === 'object' ? payload.address : {};
  const normalise = (value) => (typeof value === 'string' ? value.trim() : '');

  const street = normalise(addressInput.street ?? payload.street);
  const ward = normalise(addressInput.ward ?? payload.ward);
  const district = normalise(addressInput.district ?? payload.district);
  const city = normalise(addressInput.city ?? payload.city);
  const fullAddress =
    normalise(addressInput.fullAddress ?? payload.fullAddress) ||
    computeFullAddress({ street, ward, district, city });
  const coordinates =
    parseCoordinates(addressInput.location?.coordinates) ||
    parseCoordinates(addressInput.coordinates) ||
    parseCoordinates(payload.location) ||
    parseCoordinates({ lat: payload.lat, lng: payload.lng });

  const address = {};
  if (street) address.street = street;
  if (ward) address.ward = ward;
  if (district) address.district = district;
  if (city) address.city = city;
  if (fullAddress) address.fullAddress = fullAddress;
  if (coordinates) {
    address.location = { type: 'Point', coordinates };
  }
  return address;
};

export const listDrones = async (_req, res) => {
  try {
    const now = Date.now();
    const drones = await Drone.find().sort({ updatedAt: -1 });
    // Offline logic disabled to keep drones idle/online in demo
    res.json({ data: drones.map(formatDrone) });
  } catch (error) {
    console.error('Failed to list drones', error);
    res.status(500).json({ message: 'Không thể lấy danh sách drone' });
  }
};

export const createDrone = async (req, res) => {
  try {
    const { droneId, name, battery, batteryLevel, status, hubId, location, currentOrderId, maxPayloadKg, maintenanceStatus, maintenanceLogs } =
      req.body || {};

    const code = (req.body.code || droneId || name || '').toString().trim().toUpperCase();

    if (!code) {
      return res.status(400).json({ message: 'Mã drone (code/droneId) là bắt buộc' });
    }

    const existing = await Drone.findOne({ $or: [{ code }, { droneId: code }] });
    if (existing) {
      return res.status(409).json({ message: 'droneId đã tồn tại' });
    }

    const normalizedStatus = normaliseStatus(status, DRONE_STATUSES) || 'IDLE';
    const point = toGeoPoint(location) || toGeoPoint({ lat: req.body.lat, lng: req.body.lng });
    const numericBattery =
      typeof batteryLevel !== 'undefined'
        ? Number(batteryLevel)
        : typeof battery !== 'undefined'
        ? Number(battery)
        : undefined;

    const doc = await Drone.create({
      code,
      droneId: code,
      name: name || code,
      battery: numericBattery,
      batteryLevel: numericBattery,
      status: normalizedStatus,
      hubId,
      currentLocation: point,
      currentOrderId,
      maxPayloadKg,
      maintenanceStatus: maintenanceStatus ? maintenanceStatus.toUpperCase() : undefined,
      maintenanceLogs,
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    });

    emitEvent({ event: 'drone-status-update', payload: formatDrone(doc), broadcast: true });
    return res.status(201).json({ message: 'Tạo drone thành công', data: formatDrone(doc) });
  } catch (error) {
    console.error('Failed to create drone', error);
    return res.status(500).json({ message: 'Không thể tạo drone' });
  }
};

export const updateDrone = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      battery,
      batteryLevel,
      status,
      hubId,
      location,
      currentOrderId,
      maxPayloadKg,
      maintenanceStatus,
      maintenanceLogs,
      nextMaintenanceDueAt,
    } = req.body || {};

    const update = {
      updatedAt: new Date(),
    };

    if (req.body.code) update.code = req.body.code.toString().toUpperCase();
    if (name) update.name = name;
    if (typeof battery !== 'undefined') update.battery = Number(battery);
    if (typeof batteryLevel !== 'undefined') update.batteryLevel = Number(batteryLevel);
    if (status) update.status = normaliseStatus(status, DRONE_STATUSES) || status;
    if (hubId) update.hubId = hubId;
    if (typeof currentOrderId !== 'undefined') update.currentOrderId = currentOrderId;
    if (typeof maxPayloadKg !== 'undefined') update.maxPayloadKg = Number(maxPayloadKg);
    if (maintenanceStatus) update.maintenanceStatus = maintenanceStatus.toUpperCase();
    if (Array.isArray(maintenanceLogs)) update.maintenanceLogs = maintenanceLogs;
    if (nextMaintenanceDueAt) update.nextMaintenanceDueAt = new Date(nextMaintenanceDueAt);

    const point = toGeoPoint(location) || toGeoPoint({ lat: req.body.lat, lng: req.body.lng });
    if (point) {
      update.currentLocation = point;
      update.lastHeartbeatAt = new Date();
      update.location = { lat: point.coordinates[1], lng: point.coordinates[0] };
    }

    const filter = buildIdFilter(id);
    const drone = await Drone.findOneAndUpdate(filter, { $set: update }, { new: true });

    if (!drone) {
      return res.status(404).json({ message: 'Không tìm thấy drone' });
    }

    emitEvent({ event: 'drone-status-update', payload: formatDrone(drone), broadcast: true });
    return res.json({ message: 'Cập nhật drone thành công', data: formatDrone(drone) });
  } catch (error) {
    console.error('Failed to update drone', error);
    return res.status(500).json({ message: 'Không thể cập nhật drone' });
  }
};

export const deleteDrone = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = buildIdFilter(id);
    const drone = await Drone.findOneAndDelete(filter);
    if (!drone) {
      return res.status(404).json({ message: 'Không tìm thấy drone' });
    }
    emitEvent({ event: 'drone-status-update', payload: { droneId: drone.droneId, status: 'deleted' }, broadcast: true });
    return res.json({ message: 'Đã xóa drone', data: formatDrone(drone) });
  } catch (error) {
    console.error('Failed to delete drone', error);
    return res.status(500).json({ message: 'Không thể xóa drone' });
  }
};

export const updateDroneLocation = async (req, res) => {
  try {
    const { droneId, lat, lng, battery, status, hubId } = req.body || {};

    if (!droneId || typeof lat === 'undefined' || typeof lng === 'undefined') {
      return res.status(400).json({ message: 'droneId, lat, lng là bắt buộc' });
    }

    const numericLat = Number(lat);
    const numericLng = Number(lng);
    const numericBattery = typeof battery === 'undefined' ? undefined : Number(battery);

    if (Number.isNaN(numericLat) || Number.isNaN(numericLng)) {
      return res.status(400).json({ message: 'lat/lng không hợp lệ' });
    }

    const point = { type: 'Point', coordinates: [numericLng, numericLat] };

    const update = {
      location: { lat: numericLat, lng: numericLng },
      currentLocation: point,
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    };
    if (!Number.isNaN(numericBattery)) {
      update.battery = numericBattery;
      update.batteryLevel = numericBattery;
    }
    if (status) update.status = normaliseStatus(status, DRONE_STATUSES) || status;
    if (hubId) update.hubId = hubId;

    const normalizedId = droneId.toString().toUpperCase();

    const drone = await Drone.findOneAndUpdate(
      { $or: [{ droneId: normalizedId }, { code: normalizedId }] },
      {
        $set: update,
        $setOnInsert: {
          code: normalizedId,
          name: droneId,
          droneId: normalizedId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const payload = {
      droneId: drone.droneId,
      lat: drone.location?.lat,
      lng: drone.location?.lng,
      battery: typeof drone.batteryLevel === 'number' ? drone.batteryLevel : drone.battery,
      status: drone.status,
      hubId: drone.hubId,
      currentOrderId: drone.currentOrderId,
      location: drone.location,
      currentLocation: formatLocation(drone),
      updatedAt: drone.updatedAt,
    };
    emitDroneLocation(payload);
    emitEvent({ event: 'drone-location-update', payload, broadcast: true });
    emitEvent({ event: 'drone-status-update', payload, broadcast: true });
    emitEvent({ event: 'drone_waypoint_update', payload, broadcast: true });
    if (typeof drone.battery === 'number' && drone.battery < 20) {
      emitEvent({ event: 'drone.low_battery', payload: { droneId: drone.droneId, battery: drone.battery }, broadcast: true });
    }

    return res.json({ message: 'Đã cập nhật vị trí drone', data: formatDrone(drone) });
  } catch (error) {
    console.error('Failed to update drone location', error);
    return res.status(500).json({ message: 'Không thể cập nhật vị trí drone' });
  }
};

export const listHubs = async (_req, res) => {
  try {
    const hubs = await Hub.find().sort({ createdAt: -1 });
    res.json({ data: hubs });
  } catch (error) {
    console.error('Failed to list hubs', error);
    res.status(500).json({ message: 'Không thể lấy danh sách hub' });
  }
};

export const createHub = async (req, res) => {
  try {
    const { name, radiusKm, isActive } = req.body || {};
    const address = buildHubAddress(req.body);
    const code = (req.body.code || name || '').toString().trim().toUpperCase();

    if (!name || !code || !address.fullAddress) {
      return res.status(400).json({ message: 'Tên, mã hub và địa chỉ là bắt buộc' });
    }

    const hub = await Hub.create({
      name,
      code,
      address,
      location: address.location?.coordinates
        ? { lat: address.location.coordinates[1], lng: address.location.coordinates[0] }
        : undefined,
      radiusKm: typeof radiusKm !== 'undefined' ? Number(radiusKm) : undefined,
      isActive: typeof isActive === 'boolean' ? isActive : true,
    });

    return res.status(201).json({ message: 'Tạo hub thành công', data: hub });
  } catch (error) {
    console.error('Failed to create hub', error);
    return res.status(500).json({ message: 'Không thể tạo hub' });
  }
};

export const updateHub = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, radiusKm, isActive } = req.body || {};
    const address = buildHubAddress(req.body);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID hub không hợp lệ' });
    }

    const update = {};
    if (name) update.name = name;
    if (address && Object.keys(address).length) {
      update.address = { ...(address || {}) };
      if (address.fullAddress) {
        update['address.fullAddress'] = address.fullAddress;
      }
      if (address.location?.coordinates) {
        update.location = { lat: address.location.coordinates[1], lng: address.location.coordinates[0] };
      }
    }
    if (typeof radiusKm !== 'undefined') update.radiusKm = Number(radiusKm);
    if (typeof isActive === 'boolean') update.isActive = isActive;
    if (req.body.code) update.code = req.body.code.toString().toUpperCase();

    const hub = await Hub.findOneAndUpdate({ _id: id }, { $set: update }, { new: true });

    if (!hub) {
      return res.status(404).json({ message: 'Không tìm thấy hub' });
    }

    return res.json({ message: 'Cập nhật hub thành công', data: hub });
  } catch (error) {
    console.error('Failed to update hub', error);
    return res.status(500).json({ message: 'Không thể cập nhật hub' });
  }
};

export const deleteHub = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID hub không hợp lệ' });
    }

    const hub = await Hub.findOneAndDelete({ _id: id });
    if (!hub) {
      return res.status(404).json({ message: 'Không tìm thấy hub' });
    }
    return res.json({ message: 'Đã xóa hub', data: hub });
  } catch (error) {
    console.error('Failed to delete hub', error);
    return res.status(500).json({ message: 'Không thể xóa hub' });
  }
};

export const getHubById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID hub không hợp lệ' });
    }
    const hub = await Hub.findById(id);
    if (!hub) {
      return res.status(404).json({ message: 'Không tìm thấy hub' });
    }
    return res.json({ data: hub });
  } catch (error) {
    console.error('Failed to fetch hub', error);
    return res.status(500).json({ message: 'Không thể lấy thông tin hub' });
  }
};

export const listDroneDeliveries = async (req, res) => {
  try {
    const filter = {};
    if (req.query.orderId) filter.orderId = req.query.orderId;
    if (req.query.droneId) filter.droneId = req.query.droneId;
    if (req.query.hubId) filter.hubId = req.query.hubId;

    const deliveries = await DroneDelivery.find(filter).sort({ createdAt: -1 }).populate('droneId hubId');
    // Chuẩn hóa để luôn có waypoint (hub, restaurant, customer, hub)
    const normalized = deliveries.map((delivery) => {
      const waypoints = Array.isArray(delivery.route?.waypoints) ? delivery.route.waypoints : [];
      if (waypoints.length >= 3) return delivery;

      const hub = delivery.hubId?.location;
      const restaurant = delivery.route?.restaurantLocation || (delivery.restaurantLocation && {
        lat: delivery.restaurantLocation.lat,
        lng: delivery.restaurantLocation.lng,
      });
      const customer = delivery.route?.customerLocation || (delivery.customerLocation && {
        lat: delivery.customerLocation.lat,
        lng: delivery.customerLocation.lng,
      });
      const pts = [];
      if (hub?.lat && hub?.lng) pts.push({ lat: hub.lat, lng: hub.lng, type: 'HUB' });
      if (restaurant?.lat && restaurant?.lng) pts.push({ lat: restaurant.lat, lng: restaurant.lng, type: 'RESTAURANT' });
      if (customer?.lat && customer?.lng) pts.push({ lat: customer.lat, lng: customer.lng, type: 'CUSTOMER' });
      if (pts.length) pts.push(pts[0]); // quay về hub

      return {
        ...delivery.toObject(),
        route: {
          ...(delivery.route || {}),
          waypoints: pts.length ? pts : waypoints,
        },
      };
    });

    res.json({ data: normalized });
  } catch (error) {
    console.error('Failed to list drone deliveries', error);
    res.status(500).json({ message: 'Không thể lấy danh sách phân công drone' });
  }
};

export const createDroneDelivery = async (req, res) => {
  try {
    const { orderId, droneId, hubId, customerId, restaurantId, route, status } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ message: 'orderId là bắt buộc' });
    }

    let resolvedDroneId = undefined;
    if (droneId) {
      if (mongoose.isValidObjectId(droneId)) {
        resolvedDroneId = droneId;
      } else {
        const droneDoc = await Drone.findOne({
          $or: [{ code: droneId.toString().toUpperCase() }, { droneId: droneId.toString() }],
        }).select('_id');
        resolvedDroneId = droneDoc?._id;
      }
    }

    let resolvedHubId = undefined;
    if (hubId) {
      if (mongoose.isValidObjectId(hubId)) {
        resolvedHubId = hubId;
      } else {
        const hubDoc = await Hub.findOne({
          $or: [{ code: hubId.toString().toUpperCase() }, { _id: hubId }],
        }).select('_id');
        resolvedHubId = hubDoc?._id;
      }
    }

    const normalizedStatus = normaliseStatus(status, DELIVERY_STATUSES) || 'PENDING';
    let resolvedRoute = route;

    let hubCoords = parseCoordinates(req.body.hubLocation);
    let restaurantCoords = parseCoordinates(req.body.restaurantLocation);
    let customerCoords = parseCoordinates(req.body.customerLocation);

    // Try to hydrate missing coordinates from order/restaurant services
    if ((!customerCoords || !restaurantCoords) && orderId && process.env.ORDER_SERVICE_URL) {
      const orderDetail = await safeFetchJson(
        `${process.env.ORDER_SERVICE_URL.replace(/\/$/, '')}/api/orders/${orderId}`
      );
      if (orderDetail) {
        if (!customerCoords && Number.isFinite(Number(orderDetail.deliveryLat)) && Number.isFinite(Number(orderDetail.deliveryLng))) {
          customerCoords = [Number(orderDetail.deliveryLng), Number(orderDetail.deliveryLat)];
        }
        if (!resolvedHubId && orderDetail.droneHubId) {
          resolvedHubId = orderDetail.droneHubId;
        }
        if (!restaurantCoords && orderDetail.restaurantLocation?.lng && orderDetail.restaurantLocation?.lat) {
          restaurantCoords = [Number(orderDetail.restaurantLocation.lng), Number(orderDetail.restaurantLocation.lat)];
        }
        if (!resolvedHubId && orderDetail.droneHubId) {
          resolvedHubId = orderDetail.droneHubId;
        }
        if (!resolvedHubId && orderDetail.hubId) {
          resolvedHubId = orderDetail.hubId;
        }
      }
    }

    if (!restaurantCoords && (restaurantId || (restaurantId === undefined && resolvedHubId))) {
      const rId = restaurantId || null;
      if (rId && process.env.RESTAURANT_SERVICE_URL) {
        const restaurantDetail = await safeFetchJson(
          `${process.env.RESTAURANT_SERVICE_URL.replace(/\/$/, '')}/api/restaurants/${rId}`
        );
        const coords = parseCoordinates(restaurantDetail?.address?.location?.coordinates);
        if (coords) {
          restaurantCoords = coords;
        }
      }
    }

    if (!resolvedRoute && hubCoords && restaurantCoords && customerCoords) {
      try {
        const routing = await getRouteFromORS({
          origin: hubCoords,
          waypoints: [restaurantCoords],
          destination: customerCoords,
        });
        resolvedRoute = {
          provider: 'openrouteservice',
          waypoints: [
            { lng: hubCoords[0], lat: hubCoords[1], type: 'HUB' },
            { lng: restaurantCoords[0], lat: restaurantCoords[1], type: 'RESTAURANT' },
            { lng: customerCoords[0], lat: customerCoords[1], type: 'CUSTOMER' },
          ],
          geometry: routing.geometry,
          distance: routing.distance,
          duration: routing.duration,
        };
      } catch (err) {
        console.warn('Failed to generate ORS route', err.message);
      }
    }

    const payload = {
      orderId,
      droneId: resolvedDroneId,
      hubId: resolvedHubId,
      customerId,
      restaurantId,
      route: resolvedRoute || route,
      status: normalizedStatus,
    };

    if (['TAKEOFF', 'EN_ROUTE_TO_RESTAURANT', 'EN_ROUTE_TO_CUSTOMER', 'DELIVERED', 'RETURNING', 'COMPLETED'].includes(normalizedStatus)) {
      payload.startedAt = req.body.startedAt ? new Date(req.body.startedAt) : new Date();
    }
    if (['DELIVERED', 'COMPLETED'].includes(normalizedStatus) && req.body.completedAt) {
      payload.completedAt = new Date(req.body.completedAt);
    }

    const delivery = await DroneDelivery.create(payload);
    emitEvent({
      event: 'drone-delivery-created',
      payload: { id: delivery._id, orderId: delivery.orderId, droneId: delivery.droneId, hubId: delivery.hubId },
      broadcast: true,
    });

    return res.status(201).json({ message: 'Tạo phân công drone thành công', data: delivery });
  } catch (error) {
    console.error('Failed to create drone delivery', error);
    return res.status(500).json({ message: 'Không thể tạo phân công drone' });
  }
};

export const addTrackingLog = async (req, res) => {
  try {
    const assignmentId = req.params.id || req.body.assignmentId;
    const { droneId: bodyDroneId, lat, lng, altitudeMeters, speedMps, batteryLevel, status } = req.body || {};

    const point =
      toGeoPoint({ lat, lng }) ||
      toGeoPoint(req.body.location) ||
      toGeoPoint(req.body.coordinates) ||
      toGeoPoint(req.body);

    if (!point) {
      return res.status(400).json({ message: 'lat/lng là bắt buộc' });
    }

    let droneId = bodyDroneId;
    let orderId = req.body.orderId;
    if (assignmentId) {
      const assignment = await DroneDelivery.findById(assignmentId);
      if (assignment) {
        droneId = droneId || assignment.droneId;
        orderId = orderId || assignment.orderId;
      }
    }

    if (!droneId) {
      return res.status(400).json({ message: 'droneId là bắt buộc' });
    }

    const droneUpdate = {
      currentLocation: point,
      location: { lat: point.coordinates[1], lng: point.coordinates[0] },
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    };
    if (typeof batteryLevel !== 'undefined') {
      const numericBattery = Number(batteryLevel);
      if (!Number.isNaN(numericBattery)) {
        droneUpdate.batteryLevel = numericBattery;
        droneUpdate.battery = numericBattery;
      }
    }
    if (status) {
      droneUpdate.status = normaliseStatus(status, DRONE_STATUSES) || status;
    }

    const droneFilter = mongoose.isValidObjectId(droneId)
      ? { _id: droneId }
      : { $or: [{ code: droneId.toString().toUpperCase() }, { droneId: droneId.toString() }] };

    const drone = await Drone.findOneAndUpdate(
      droneFilter,
      {
        $set: droneUpdate,
        $setOnInsert: {
          code: droneId.toString().toUpperCase(),
          droneId: droneId.toString().toUpperCase(),
          name: droneId.toString(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const log = await DroneTrackingLog.create({
      droneId: drone?._id,
      assignmentId,
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
      location: point,
      altitudeMeters,
      speedMps,
      batteryLevel,
      extra: req.body.extra,
    });

    const payload = {
      droneId: drone?.droneId || droneId,
      assignmentId,
      orderId: orderId || undefined,
      timestamp: log.timestamp,
      lng: point.coordinates[0],
      lat: point.coordinates[1],
      altitudeMeters,
      speedMps,
      batteryLevel: droneUpdate.batteryLevel,
      status: droneUpdate.status || drone?.status,
      hubId: drone?.hubId,
    };

    emitDroneLocation({ ...payload, currentLocation: payload });
    emitEvent({ event: 'drone:tracking:update', payload, broadcast: true });

    return res.status(201).json({ message: 'Đã ghi nhận tracking log', data: log });
  } catch (error) {
    console.error('Failed to append tracking log', error);
    return res.status(500).json({ message: 'Không thể lưu tracking log' });
  }
};
