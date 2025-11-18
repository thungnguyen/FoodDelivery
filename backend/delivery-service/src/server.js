import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import driverRoutes from './routes/driverRoutes.js';
import adminDriverRoutes from './routes/adminDriverRoutes.js';

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

app.get('/', (_req, res) => {
  res.send('Delivery Service Running...');
});

const PORT = process.env.PORT || 5003;

mongoose
  .connect(process.env.MONGO_URI, {})
  .then(() => {
    console.log('✅ Delivery service connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚚 Delivery service listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Failed to connect to MongoDB', error);
    process.exit(1);
  });
