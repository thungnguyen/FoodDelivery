import { Server as SocketIOServer } from 'socket.io';

let io;

export const initDroneSocket = (server, allowedOrigins = ['*']) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    const client = socket.handshake.address || socket.id;
    console.log(`[drone-socket] client connected ${client}`);

    socket.on('disconnect', (reason) => {
      console.log(`[drone-socket] client disconnected ${client} reason=${reason}`);
    });
  });

  console.log('[drone-socket] Socket.IO initialized for drone updates');
  return io;
};

export const emitDroneLocation = (payload) => {
  if (!io) return;
  io.emit('drone-location-update', payload);
};

export const getDroneSocket = () => io;

