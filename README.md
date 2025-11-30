# SkyDish – Nền tảng Giao Đồ Ăn Microservices

SkyDish là nền tảng đặt và giao đồ ăn theo mô hình marketplace, xây dựng trên kiến trúc microservices Node.js để phục vụ bốn vai trò chính: Khách hàng, Quản trị Nhà hàng, Tài xế giao hàng và Super Admin. Hệ thống kết hợp API REST, cổng realtime Socket.IO và frontend React để bảo đảm trải nghiệm đặt món xuyên suốt từ onboarding tới giao thành công.

---

## Mục lục
1. [Giới thiệu nhanh](#1-giới-thiệu-nhanh)  
2. [Kiến trúc & Dịch vụ](#2-kiến-trúc--dịch-vụ)  
3. [Công nghệ chính](#3-công-nghệ-chính)  
4. [Yêu cầu hệ thống & phụ thuộc](#4-yêu-cầu-hệ-thống--phụ-thuộc)  
5. [Cấu trúc repository](#5-cấu-trúc-repository)  
6. [Biến môi trường](#6-biến-môi-trường)  
7. [Thiết lập & vận hành local](#7-thiết-lập--vận-hành-local)  
8. [Microservices & endpoint](#8-microservices--endpoint)  
9. [Realtime Gateway](#9-realtime-gateway)  
10. [Frontend](#10-frontend)  
11. [Testing & linting](#11-testing--linting)  
12. [Troubleshooting](#12-troubleshooting)  
13. [Demo & tài liệu](#13-demo--tài-liệu)  

---

## 1. Giới thiệu nhanh

- **Khách hàng:** đăng ký/đăng nhập, khám phá nhà hàng, đặt đơn, theo dõi trạng thái, gửi phản hồi.  
- **Quản trị Nhà hàng:** quản lý hồ sơ, bật/tắt hoạt động, CRUD menu, nhận và cập nhật đơn.  
- **Tài xế giao hàng:** quản lý tài khoản, nhận nhiệm vụ, cập nhật lộ trình, xem thống kê.  
- **Super Admin:** duyệt nhà hàng/tài xế, xem khách hàng và đơn, proxy dữ liệu để vận hành tập trung.

Toàn bộ dịch vụ giao tiếp qua REST + JWT, phát sự kiện qua Redis/Socket.IO, thanh toán qua Stripe và thông báo qua Twilio/Resend.

---

## 2. Kiến trúc & Dịch vụ

### 2.1 Sơ đồ mức cao
```
Frontend (React) ──> API Gateway (per service URL)
                             │
                             ├─ Auth Service (4000)
                             ├─ Restaurant Service (5002)
                             ├─ Order Service (5005)
                             ├─ Delivery Service (5003)
                             ├─ Payment Service (5004)
                             └─ Realtime Gateway (5050) ⇄ Redis (6379)
MongoDB Atlas/Cluster (chia sẻ cho từng service)
```

### 2.2 Bảng dịch vụ

| Service | Port (mặc định) | Mô tả chính | Công nghệ nổi bật |
|---------|-----------------|-------------|-------------------|
| Auth Service | 4000 | Đăng ký/đăng nhập cho khách hàng, quản trị, cấp JWT và quản lý hồ sơ | Node.js, Express, MongoDB, bcrypt |
| Restaurant Service | 5002 | Onboarding nhà hàng, menu, trạng thái mở cửa, API Super Admin proxy | Node.js, Express, MongoDB, Multer |
| Order Service | 5005 | Tạo đơn, theo dõi trạng thái, quản lý phản hồi | Node.js, Express, MongoDB, Stripe webhook consumer |
| Delivery Service | 5003 | Đăng ký tài xế, phân công giao, thống kê và quản lý tài xế | Node.js, Express, MongoDB |
| Payment Service | 5004 | Tạo Payment Intent, webhook từ Stripe, gửi thông báo | Node.js, Express, Stripe SDK, Swagger |
| Realtime Gateway | 5050 | Chuẩn hóa kết nối Socket.IO, pub/sub Redis, phát sự kiện nội bộ | Node.js, Socket.IO, Redis |
| Frontend (Khách hàng/Admin) | 3000 | Ứng dụng React chính cho khách, nhà hàng, super admin | React, Vite/CRA, JWT storage |
| Frontend (Delivery) | 3001 | Ứng dụng riêng cho tài xế | React |

---

## 3. Công nghệ chính

- **Ngôn ngữ & runtime:** Node.js 20, JavaScript/TypeScript (service phụ), React 18.  
- **Framework:** Express.js, Socket.IO.  
- **Database:** MongoDB + Mongoose.  
- **Auth:** JWT (HS256), bcrypt/bcryptjs.  
- **Realtime:** Socket.IO Gateway + Redis pub/sub.  
- **Thanh toán:** Stripe PaymentIntent + webhook.  
- **Thông báo:** Twilio SMS, Resend Email.  
- **Triển khai cục bộ:** Docker & docker-compose.  
- **Tài liệu API:** Swagger cho Payment Service, nội bộ Document/system-documentation.md (IEEE 830/29148).  

---

## 4. Yêu cầu hệ thống & phụ thuộc

- Node.js v18+ và npm (dùng khi chạy frontend/dịch vụ riêng lẻ).  
- Docker Desktop + docker-compose plugin.  
- Tài khoản MongoDB Atlas hoặc URI Mongo local.  
- Stripe dashboard để lấy khóa `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.  
- Twilio & Resend (tùy chọn) cho SMS/Email.  
- OpenCage API key nếu cần geocoding.  

---

## 5. Cấu trúc repository

```
/
├── backend/
│   ├── auth-service/
│   ├── restaurant-service/
│   ├── order-service/
│   ├── payment-service/
│   └── realtime-gateway/
├── delivery-service/
│   ├── backend/
│   └── frontend/
├── frontend/
├── Document/
│   └── system-documentation.md   # PRD, UML, ERD, DFD, ...
├── docker-compose.yml
├── README.md
├── .env
└── ...
```

---

## 6. Biến môi trường

### 6.1 `.env` gốc (dùng cho docker-compose)

```dotenv
MONGO_URI=mongodb+srv://...

JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

AUTH_PORT=4000
REST_PORT=5002
DELIVERY_PORT=5003
PAY_PORT=5004
ORDER_PORT=5005
REALTIME_PORT=5050

REALTIME_URL=http://localhost:5050
REDIS_URL=redis://localhost:6379
SERVICE_INTERNAL_KEY=super-admin-internal-key

AUTH_SERVICE_URL=http://localhost:4000
RESTAURANT_SERVICE_URL=http://localhost:5002
DELIVERY_SERVICE_URL=http://localhost:5003
ORDER_SERVICE_URL=http://localhost:5005

EMAIL_PREFER_SMTP=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_gmail@example.com
SMTP_PASS=your_gmail_app_password
NOTIFY_FROM_EMAIL="Food Delivery <your_gmail@example.com>"
SUPER_ADMIN_PORTAL_URL=http://192.168.xx.xx:3000/super-admin/dashboard
RESTAURANT_ONBOARDING_URL=http://192.168.xx.xx:3000/restaurant/activate
```

### 6.2 Biến đặc thù dịch vụ

- **Payment Service:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.  
- **Notifications:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `RESEND_API_KEY`.  
- **Order/Realtime chia sẻ:** `SHARED_JWT_SECRET` hoặc `ORDER_SERVICE_JWT_SECRET`.  
- **Frontend:** file `frontend/.env` với `VITE_API_BASE_URL`, `VITE_REALTIME_URL`, v.v. (tùy nhu cầu).  
- **Delivery frontend/backend:** thiết lập tương tự trong `delivery-service/*/.env`.  

---

## 7. Thiết lập & vận hành local

### 7.1 Chuẩn bị
1. Sao chép repo: `git clone ... && cd food-delivery-microservices`.  
2. Tạo file `.env` tại root theo mẫu trên.  
3. (Tùy chọn) Cập nhật `docker-compose.yml` nếu muốn ánh xạ cổng khác.  

### 7.2 Chạy bằng Docker Compose

```bash
docker compose up --build
```

Compose sẽ khởi động Mongo (nếu cấu hình), Redis, Realtime Gateway và toàn bộ dịch vụ Node.js. Đảm bảo cổng 3000/3001/4000/5002/5003/5004/5005/5050 trống.

### 7.3 Chạy thủ công (phát triển riêng lẻ)

```bash
# ví dụ với Auth Service
cd backend/auth-service
npm install
npm run dev
```

Lặp lại cho từng dịch vụ; nhớ cung cấp `.env` riêng (có thể dùng chung giá trị từ `.env` root).

---

## 8. Microservices & endpoint

### 8.1 Auth Service (`http://localhost:4000`)

- `POST /api/auth/register/customer` – đăng ký khách.  
- `POST /api/auth/login` – đăng nhập đa vai trò.  
- `GET /api/auth/customer/profile` – lấy hồ sơ khách (JWT).  
- `PATCH /api/auth/customer/profile` – cập nhật hồ sơ (JWT).  
- `GET /api/auth/admin/customers` – liệt kê khách (Admin JWT).  
- `PATCH /api/auth/admin/customers/:id/status` – khóa/mở khách (Admin JWT).

### 8.2 Restaurant Service (`http://localhost:5002`)

Nhà hàng:
- `POST /api/restaurants/register`  
- `POST /api/restaurants/login`  
- `GET /api/restaurants/profile` (JWT)  
- `PUT /api/restaurants/update` (JWT)  
- `PUT /api/restaurants/availability` (JWT)  
- `GET /api/restaurants/all` (Public)  
- `GET /api/restaurants/:id` (Public)

Món ăn:
- `POST /api/food-items/create` (Restaurant JWT, hỗ trợ upload/link ảnh)  
- `GET /api/food-items/` (Restaurant JWT)  
- `PUT /api/food-items/:id` (Restaurant JWT)  
- `PUT /api/food-items/availability/:id` (Restaurant JWT)  
- `DELETE /api/food-items/:id` (Restaurant JWT)  
- `GET /api/food-items/all` (Public)  
- `GET /api/food-items/restaurant/:restaurantId` (Public)

Super Admin:
- `POST /api/superadmin/register|login`  
- `GET /api/superadmin/restaurants`  
- `GET /api/superadmin/restaurant/:id`  
- `PUT /api/superadmin/restaurant/:id`  
- `PATCH /api/superadmin/restaurant/:id/approve`  
- `PATCH /api/superadmin/restaurant/:id/reject`  
- `DELETE /api/superadmin/restaurant/:id`  
- Proxy: `/api/superadmin/customers|drivers|orders`

### 8.3 Order Service (`http://localhost:5005`)

- `POST /api/orders` (Customer)  
- `GET /api/orders` (Customer/Restaurant/Driver/Admin/SuperAdmin)  
- `GET /api/orders/:id` (vai trò giống trên)  
- `PATCH /api/orders/:id` (Customer/Restaurant/Admin/SuperAdmin)  
- `PATCH /api/orders/:id/status` (Restaurant/Driver/Admin/SuperAdmin)  
- `DELETE /api/orders/:id` (Customer/Restaurant/Admin/SuperAdmin)  
- `POST /api/orders/:id/feedback` (Customer)  
- `GET /api/orders/feedback/restaurant` (Restaurant/Admin/SuperAdmin)

### 8.4 Delivery Service (`http://localhost:5003`)

Auth tài xế:
- `POST /api/auth/register`  
- `POST /api/auth/login`  
- `GET /api/auth/profile` (JWT)

Giao hàng:
- `POST /api/delivery/create`  
- `GET /api/delivery` (danh sách cá nhân)  
- `GET /api/delivery/stats/summary`  
- `GET /api/delivery/available`  
- `GET /api/delivery/order/:orderId`  
- `GET /api/delivery/:id`  
- `PUT /api/delivery/:id/status`  
- `DELETE /api/delivery/:id`

Quản trị tài xế:
- `GET /api/admin/drivers` (Admin JWT)  
- `PATCH /api/admin/drivers/:id/status`  
- `PATCH /api/admin/drivers/:id/activity`

### 8.5 Payment Service (`http://localhost:5004`)

- `POST /api/payment/process` – tạo thanh toán.  
- `POST /api/payment/webhook` – Stripe webhook (raw body).  
- Swagger UI: `http://localhost:5004/api-docs`.  
> Mỗi `orderId` là duy nhất trong Payment Service; webhook cập nhật trạng thái Paid/Failed và có thể kích hoạt SMS/Email.

---

## 9. Realtime Gateway

- Base URL: `http://localhost:5050`.  
- `GET /health` – kiểm tra sẵn sàng.  
- `POST /internal/events` – dịch vụ nội bộ phát sự kiện.  
  - Header: `x-service-key: ${SERVICE_INTERNAL_KEY}`  
  - Body: `{ "event": "...", "payload": {...}, "rooms": ["user:123"], "broadcast": true }`

Client (frontend) kết nối Socket.IO bằng JWT, tham gia room `user:{id}`, `role:{role}`. Order/Delivery Service gửi sự kiện nội bộ tới gateway ⇒ Redis pub/sub ⇒ client nhận cập nhật trạng thái theo thời gian thực.

---

## 10. Frontend

### 10.1 Ứng dụng chính (Khách hàng, Nhà hàng, Super Admin)

```bash
cd frontend
npm install
npm start
```

Truy cập `http://localhost:3000`. Các trang quan trọng:
- `/auth/login`, `/auth/register`  
- `/restaurant/*` cho quản trị nhà hàng  
- `/super-admin/dashboard` dành cho Super Admin

### 10.2 Ứng dụng tài xế (delivery-service/frontend)

```bash
cd delivery-service/frontend
npm install
npm start
```

Truy cập `http://localhost:3001`. Đảm bảo cấu hình `VITE_API_BASE_URL` trỏ về Delivery Service.

---

## 11. Testing & linting

### Backend (mỗi thư mục dịch vụ)
```bash
npm test
npm run lint
```

### Frontend
```bash
cd frontend
npm test
```

Delivery frontend/backend sử dụng lệnh tương tự trong thư mục riêng.

---

## 12. Troubleshooting

- **CORS lỗi:** đảm bảo mỗi service `app.use(cors({ origin: "http://localhost:3000", credentials: true }))`.  
- **Mongo không kết nối:** whitelist IP (Atlas) hoặc dùng `0.0.0.0/0` cho dev.  
- **Stripe webhook:** chạy `stripe listen --forward-to localhost:5004/api/payment/webhook`.  
- **Realtime không push:** kiểm tra `REDIS_URL` và `SERVICE_INTERNAL_KEY` đồng nhất giữa gateway và dịch vụ phát sự kiện.  
- **Email không gửi:** bật `EMAIL_PREFER_SMTP=true`, dùng Gmail App Password, kiểm tra log `activation.deliveryStatus`.  
- **Link email mở không được trên mobile:** đặt `SUPER_ADMIN_PORTAL_URL` và `RESTAURANT_ONBOARDING_URL` bằng IP nội bộ máy dev và đảm bảo cùng mạng Wi-Fi.  

---

## 13. Demo & tài liệu

- **Repo gốc:** [https://github.com/thungnguyen/FoodDelivery](https://github.com/thungnguyen/FoodDelivery)  
- **Tài liệu hệ thống (IEEE 830/29148):** `Document/system-documentation.md` – bao gồm PRD, Use Case, UML, ERD, DFD và tham chiếu nguồn.  

---

## Drone delivery & bản đồ (mới)

- **Biến môi trường:** `DRONE_MONGO_URI`/`DELIVERY_DB_URI` (DB `delivery_db`), `MAPTILER_API_KEY` (map tile), `ORS_API_KEY` (định tuyến).  
- **Collections mới:** `drone_hubs`, `drones`, `drone_deliveries`, `drone_tracking_logs` (có index 2dsphere + timestamp).  
- **API nội bộ (delivery-service):** `GET/POST /api/drones`, `PUT /api/drones/:id`, `POST /api/drone/update-location`, `GET/POST /api/drone-deliveries`, `POST /api/drone-deliveries/:id/logs`, `GET/POST /api/hubs`.  
- **Địa chỉ chuẩn hóa:** khách hàng & nhà hàng lưu `address.{street, ward, district, city, fullAddress, location}` để phục vụ geocode và lộ trình drone.  
- **Gợi ý migrate legacy:** map các trường text cũ (`location`, `locationCoords`) sang `address.fullAddress` và backfill tọa độ qua geocoder trước khi bật tìm kiếm/route.  

 Chúc bạn triển khai SkyDish thuận lợi!  
