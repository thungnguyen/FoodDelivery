import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { setIO } from "./utils/socket.js"; // ✅ import setIO
import { startDeliveryEventConsumers } from "./events/index.js";
import { connectRabbitMQ } from "./rabbitmq.js";

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Save socket globally
setIO(io);

// WebSocket connection
io.on("connection", (socket) => {
  console.log("📡 Driver connected:", socket.id);

  socket.on("join-driver-room", (driverId) => {
    console.log(`🚕 Driver joined room: ${driverId}`);
    socket.join(driverId);
  });

  socket.on("disconnect", () => {
    console.log("❌ Driver disconnected");
  });
});

const PORT = process.env.PORT || 5003;
server.listen(PORT, () => {
  console.log(`🚀 Delivery Service running on port ${PORT}`);
});

connectRabbitMQ()
  .then(() => startDeliveryEventConsumers())
  .catch((error) => {
    console.error("[delivery-service] Failed to initialize RabbitMQ consumers:", error.message);
  });
