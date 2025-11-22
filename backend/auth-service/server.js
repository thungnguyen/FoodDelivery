require('dotenv').config();
const express = require('express');
const cors = require('cors');  
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.4:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowAllOrigins = process.env.CORS_ALLOW_ALL === 'true';

const corsOptions = {
  origin: allowAllOrigins
    ? true
    : (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        console.warn(`[auth-service] Blocked CORS origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
      },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Connect DB then start
connectDB().then(() => {
  app.use('/api/auth', authRoutes);

  const PORT = process.env.PORT || 4000;  
  app.listen(PORT, () => {
    console.log(`🚀 Auth Service running on port ${PORT}`);
  });
});
