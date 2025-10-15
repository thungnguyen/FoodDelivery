import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import {
  listDrivers,
  updateDriverApproval,
  updateDriverActivity,
} from '../controllers/driverController.js';

const router = express.Router();

router.get('/', adminAuth, listDrivers);
router.patch('/:id/status', adminAuth, updateDriverApproval);
router.patch('/:id/activity', adminAuth, updateDriverActivity);

export default router;

