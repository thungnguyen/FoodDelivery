import 'dotenv/config.js';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { startRealtimeConsumers } from './events/index.js';
import { connectRabbitMQ } from './rabbitmq.js';

const {
  PORT = 5050,
  REDIS_URL = 'redis://redis:6379',
  JWT_SECRET,
  SERVICE_INTERNAL_KEY = 'super-admin-internal-key',
  NODE_ENV = 'development',
} = process.env;

if (!JWT_SECRET) {
  console.error('[realtime-gateway] JWT_SECRET is required');
  process.exit(1);
}

const REDIS_CHANNEL = 'realtime.events';

const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const redisSubscriber = new Redis(REDIS_URL);
const redisPublisher = new Redis(REDIS_URL);

redisSubscriber.subscribe(REDIS_CHANNEL, (err) => {
  if (err) {
    console.error('[realtime-gateway] Failed to subscribe to Redis channel', err);
  } else {
    console.log(`[realtime-gateway] Subscribed to ${REDIS_CHANNEL}`);
  }
});

const emitToClients = ({ event, payload, rooms = [], broadcast = false }) => {
  if (!event) return;
  const envelope = {
    event,
    payload,
    issuedAt: Date.now(),
  };

  if (broadcast || !rooms?.length) {
    io.emit('realtime:event', envelope);
    return;
  }

  rooms.forEach((room) => {
    if (typeof room === 'string' && room.trim()) {
      io.to(room).emit('realtime:event', envelope);
    }
  });
};

redisSubscriber.on('message', (_channel, message) => {
  try {
    const parsed = JSON.parse(message);
    emitToClients(parsed);
  } catch (error) {
    console.error('[realtime-gateway] Failed to parse Redis message', error);
  }
});

connectRabbitMQ()
  .then(() => startRealtimeConsumers(emitToClients))
  .catch((error) => {
    console.error('[realtime-gateway] Failed to start RabbitMQ consumers:', error.message);
  });

io.use((socket, next) => {
  try {
    const { token } = socket.handshake.auth || socket.handshake.query;
    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication token required'));
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    socket.join(`user:${decoded.id}`);
    socket.join(`role:${decoded.role}`);
    next();
  } catch (error) {
    console.error('[realtime-gateway] Socket auth failed', error.message);
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  const { user } = socket;
  console.log(`[realtime-gateway] client connected user=${user?.id} role=${user?.role}`);

  socket.on('realtime:subscribe', (room) => {
    if (typeof room === 'string' && room.trim()) {
      socket.join(room);
    }
  });

  socket.on('realtime:unsubscribe', (room) => {
    if (typeof room === 'string' && room.trim()) {
      socket.leave(room);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[realtime-gateway] client disconnected user=${user?.id} reason=${reason}`);
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'realtime-gateway', env: NODE_ENV });
});

app.post('/internal/events', (req, res) => {
  const serviceKey = req.headers['x-service-key'];
  if (SERVICE_INTERNAL_KEY && serviceKey !== SERVICE_INTERNAL_KEY) {
    return res.status(401).json({ message: 'Invalid service key' });
  }

  const { event, payload, rooms, broadcast } = req.body || {};
  if (!event) {
    return res.status(400).json({ message: 'Missing event name' });
  }

  const envelope = JSON.stringify({ event, payload, rooms, broadcast });
  redisPublisher.publish(REDIS_CHANNEL, envelope);

  return res.status(202).json({ message: 'Event queued' });
});

server.listen(PORT, () => {
  console.log(`[realtime-gateway] Listening on port ${PORT}`);
});
