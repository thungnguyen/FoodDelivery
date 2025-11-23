import express from 'express';
import { generateAutoRoute } from '../controllers/autoRouteController.js';

const router = express.Router();

router.post('/api/drone/auto-route', generateAutoRoute);

export default router;

