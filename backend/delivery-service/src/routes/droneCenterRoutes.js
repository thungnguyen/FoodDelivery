import express from 'express';
import {
  createDrone,
  deleteDrone,
  listDrones,
  updateDrone,
  updateDroneLocation,
  createDroneDelivery,
  listDroneDeliveries,
  addTrackingLog,
} from '../controllers/droneCenterController.js';

const router = express.Router();

router.get('/drones', listDrones);
router.post('/drones', createDrone);
router.put('/drones/:id', updateDrone);
router.delete('/drones/:id', deleteDrone);

router.post('/drone/update-location', updateDroneLocation);
router.get('/drone-deliveries', listDroneDeliveries);
router.post('/drone-deliveries', createDroneDelivery);
router.post('/drone-deliveries/:id/logs', addTrackingLog);
router.post('/drone/tracking', addTrackingLog);

export default router;

