# 🍽️ Hệ thống FoodDelivery – Kiến trúc RabbitMQ + Socket.IO và Quy trình Dòng Tiền

---

## 📦 Tổng quan hệ thống

Hệ thống bao gồm các service chính:

- **Auth Service** – Xác thực và phân quyền người dùng  
- **Restaurant Service** – Quản lý nhà hàng và thực đơn  
- **Order Service** – Tạo và quản lý đơn hàng  
- **Payment Service** – Xử lý thanh toán (Online / COD)  
- **Delivery Service** – Giao hàng và theo dõi trạng thái  
- **Admin Service** – Quản lý dòng tiền, đối soát, hoa hồng  
- **Realtime Gateway (Socket.IO)** – Gửi thông báo realtime đến người dùng  

---

## 🎯 Mục tiêu

Chuyển toàn bộ giao tiếp giữa các **service backend** sang kiến trúc **Event-Driven Architecture (EDA)** sử dụng **RabbitMQ**.  
Giữ lại **Socket.IO** chỉ để phục vụ **giao tiếp realtime giữa server và client**.

- **RabbitMQ**: Dùng cho giao tiếp **giữa các service (publish/consume events)**  
- **Socket.IO**: Dùng cho giao tiếp **giữa server và client realtime**  

Mục tiêu đạt được:
- Các service **độc lập và tách rời**  
- **Xử lý bất đồng bộ** giữa các bước thanh toán và giao hàng  
- **Realtime** cho người dùng mà không cần gọi chéo API giữa các service  

---

## ⚙️ Kiến trúc và luồng hoạt động

### 🧩 Module RabbitMQ dùng chung

Tạo module `src/rabbitmq.js` cho mỗi service để kết nối, publish và consume event.

```js
import amqp from "amqplib";

let channel;
export async function connectRabbitMQ(url) {
  const conn = await amqp.connect(url);
  channel = await conn.createChannel();
  await channel.assertExchange("app.direct", "direct", { durable: true });
  console.log("[RabbitMQ] Connected!");
}
export function publish(routingKey, payload) {
  channel.publish("app.direct", routingKey, Buffer.from(JSON.stringify(payload)));
}
export function consume(queue, routingKey, handler) {
  channel.assertQueue(queue, { durable: true });
  channel.bindQueue(queue, "app.direct", routingKey);
  channel.consume(queue, async (msg) => {
    const data = JSON.parse(msg.content.toString());
    await handler(data);
    channel.ack(msg);
  });
}
