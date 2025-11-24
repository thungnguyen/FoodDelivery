import mongoose from 'mongoose';
import Drone from '../models/Drone.js';
import Hub from '../models/Hub.js';
import { emitDroneLocation } from '../realtime/droneSocket.js';
import emitEvent from '../utils/eventBus.js';

const OFFLINE_THRESHOLD_MS = 15_000;

const formatDrone = (drone) => ({
  id: drone._id,
  droneId: drone.droneId,
  name: drone.name,
  battery: drone.battery,
  status: drone.status,
  hubId: drone.hubId,
  currentOrderId: drone.currentOrderId,
  location: drone.location,
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
  if (filters.length === 1) return filters[0];
  return { $or: filters };
};

export const listDrones = async (_req, res) => {
  try {
    const now = Date.now();
    const drones = await Drone.find().sort({ updatedAt: -1 });
    const offlineEntries = [];

    drones.forEach((drone) => {
      const last = drone.updatedAt ? new Date(drone.updatedAt).getTime() : 0;
      if (now - last > OFFLINE_THRESHOLD_MS && drone.status !== 'offline') {
        offlineEntries.push({ id: drone._id, droneId: drone.droneId });
      }
    });

    if (offlineEntries.length) {
      await Drone.updateMany({ _id: { $in: offlineEntries.map((item) => item.id) } }, { $set: { status: 'offline' } });
      offlineEntries.forEach((entry) =>
        emitEvent({ event: 'drone-status-update', payload: { droneId: entry.droneId, status: 'offline' }, broadcast: true })
      );
    }

    const refreshed = offlineEntries.length ? await Drone.find().sort({ updatedAt: -1 }) : drones;
    res.json({ data: refreshed.map(formatDrone) });
  } catch (error) {
    console.error('Failed to list drones', error);
    res.status(500).json({ message: 'Không thể lấy danh sách drone' });
  }
};

export const createDrone = async (req, res) => {
  try {
    const { droneId, name, battery, status, hubId, location, currentOrderId } = req.body || {};

    if (!droneId || !name) {
      return res.status(400).json({ message: 'droneId và name là bắt buộc' });
    }

    const existing = await Drone.findOne({ droneId });
    if (existing) {
      return res.status(409).json({ message: 'droneId đã tồn tại' });
    }

    const doc = await Drone.create({
      droneId,
      name,
      battery,
      status,
      hubId,
      location,
      currentOrderId,
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
    const { name, battery, status, hubId, location, currentOrderId } = req.body || {};

    const update = {
      updatedAt: new Date(),
    };

    if (name) update.name = name;
    if (typeof battery !== 'undefined') update.battery = battery;
    if (status) update.status = status;
    if (hubId) update.hubId = hubId;
    if (typeof currentOrderId !== 'undefined') update.currentOrderId = currentOrderId;
    if (location && typeof location.lat !== 'undefined' && typeof location.lng !== 'undefined') {
      update.location = {
        lat: Number(location.lat),
        lng: Number(location.lng),
      };
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

    const update = {
      location: { lat: numericLat, lng: numericLng },
      updatedAt: new Date(),
    };
    if (!Number.isNaN(numericBattery)) update.battery = numericBattery;
    if (status) update.status = status;
    if (hubId) update.hubId = hubId;

    const drone = await Drone.findOneAndUpdate(
      { droneId },
      {
        $set: update,
        $setOnInsert: {
          name: droneId,
          droneId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const payload = {
      droneId: drone.droneId,
      lat: drone.location?.lat,
      lng: drone.location?.lng,
      battery: drone.battery,
      status: drone.status,
      hubId: drone.hubId,
      currentOrderId: drone.currentOrderId,
      location: drone.location,
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
    const { name, location, radiusKm } = req.body || {};
    if (!name || !location || typeof location.lat === 'undefined' || typeof location.lng === 'undefined') {
      return res.status(400).json({ message: 'Tên hub và tọa độ là bắt buộc' });
    }

    const hub = await Hub.create({
      name,
      location: { lat: Number(location.lat), lng: Number(location.lng) },
      radiusKm: Number(radiusKm ?? 0),
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
    const { name, location, radiusKm } = req.body || {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID hub không hợp lệ' });
    }

    const update = {};
    if (name) update.name = name;
    if (location && typeof location.lat !== 'undefined' && typeof location.lng !== 'undefined') {
      update.location = { lat: Number(location.lat), lng: Number(location.lng) };
    }
    if (typeof radiusKm !== 'undefined') update.radiusKm = Number(radiusKm);

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
