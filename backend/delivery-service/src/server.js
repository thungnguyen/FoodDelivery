import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import driverRoutes from './routes/driverRoutes.js';
import adminDriverRoutes from './routes/adminDriverRoutes.js';
import droneCenterRoutes from './routes/droneCenterRoutes.js';
import hubRoutes from './routes/hubRoutes.js';
import { initDroneSocket } from './realtime/droneSocket.js';
import droneFlowProxy from './routes/droneFlowProxy.js';
import autoRoute from './routes/autoRoute.js';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://26.32.188.49:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

app.use('/api/drivers', driverRoutes);
app.use('/api/admin/drivers', adminDriverRoutes);
app.use('/api', droneCenterRoutes);
app.use('/api/hubs', hubRoutes);
app.use('/', droneFlowProxy);
app.use('/', autoRoute);

app.get('/', (_req, res) => {
  res.send('Delivery Service Running...');
});

const PORT = process.env.PORT || 5003;
const server = http.createServer(app);
initDroneSocket(server, allowedOrigins.length ? allowedOrigins : ['*']);

const MONGO_URI = process.env.DELIVERY_DB_URI || process.env.DRONE_MONGO_URI || process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI, { dbName: process.env.DELIVERY_DB_NAME })
  .then(() => {
    console.log('✅ Delivery service connected to MongoDB', process.env.DELIVERY_DB_NAME || '');
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚚 Delivery service + drone socket listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Failed to connect to MongoDB', error);
    process.exit(1);
  });
