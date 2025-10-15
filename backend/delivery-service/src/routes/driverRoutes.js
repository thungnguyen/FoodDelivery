import express from 'express';
import { registerDriver } from '../controllers/driverController.js';

const router = express.Router();

router.post('/register', registerDriver);

export default router;

