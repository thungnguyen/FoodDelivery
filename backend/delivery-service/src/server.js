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

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://192.168.1.4:3000')
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

mongoose
  .connect(process.env.MONGO_URI, {})
  .then(() => {
    console.log('✅ Delivery service connected to MongoDB');
    server.listen(PORT, () => {
      console.log(`🚚 Delivery service + drone socket listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Failed to connect to MongoDB', error);
    process.exit(1);
  });
