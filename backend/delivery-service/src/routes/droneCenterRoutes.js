import express from 'express';
import {
  createDrone,
  deleteDrone,
  listDrones,
  updateDrone,
  updateDroneLocation,
} from '../controllers/droneCenterController.js';

const router = express.Router();

router.get('/drones', listDrones);
router.post('/drones', createDrone);
router.put('/drones/:id', updateDrone);
router.delete('/drones/:id', deleteDrone);

router.post('/drone/update-location', updateDroneLocation);

export default router;

