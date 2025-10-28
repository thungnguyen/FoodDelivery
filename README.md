# SkyDish – Food Delivery Microservices

Cloud‑native food ordering and delivery platform built with microservices.
Roles supported: Customer, Restaurant Admin, Delivery Driver, Super Admin.

---

## Table of Contents

1. [Overview](#overview)  
2. [Tech Stack](#tech-stack)  
3. [Prerequisites](#prerequisites)  
4. [Repository Layout](#repository-layout)  
5. [Environment Variables](#environment-variables)  
6. [Running Locally](#running-locally)  
7. [Microservices & Endpoints](#microservices--endpoints)  
8. [Realtime Gateway](#realtime-gateway)  
9. [Frontend Setup](#frontend-setup)  
10. [Testing & Linting](#testing--linting)  
11. [Troubleshooting](#troubleshooting)  
12. [Demo & Submission](#demo--submission)  

---

## 1. Overview

- Customers: đăng ký/đăng nhập, đặt đơn, theo dõi trạng thái, phản hồi.  
- Restaurant Admin: quản trị hồ sơ, mở/đóng, quản lý menu, xem đơn.  
- Delivery Driver: đăng ký/đăng nhập, nhận giao, cập nhật trạng thái, thống kê.  
- Super Admin: duyệt nhà hàng/tài xế, xem khách hàng/đơn, proxy quản trị.

Microservices & Infra:
1. Auth Service (4000)  
2. Restaurant Service (5002)  
3. Order Service (5005)  
4. Delivery Service (5003)  
5. Payment Service (5004)  
6. Realtime Gateway (5050) + Redis (6379)  
7. Frontend (3000) + Delivery Frontend (3001)

---

## 2. Tech Stack

- Frontend: React  
- Backend: Node.js 20, Express.js  
- Database: MongoDB (Mongoose)  
- Auth: JWT, bcrypt/bcryptjs  
- Realtime: Socket.IO, Redis pub/sub (gateway)  
- Payments: Stripe (PaymentIntent + Webhook)  
- Notifications: Twilio SMS, Resend Email  
- Containers: Docker Compose  
- Docs: Swagger (Payment Service)

---

## 3. Prerequisites

- Node.js v18+ & npm (local dev for web UIs)  
- Docker & docker-compose  
- MongoDB URI (Atlas hoặc local)  
- API keys: JWT_SECRET, STRIPE, Twilio, Resend, (tùy chọn) OpenCage Geocoding

---

## 4. Repository Layout

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
├── docker-compose.yml
├── README.md
├── members.md
└── submission.txt
```

---

## 5. Environment Variables

Create `.env` at project root (used by docker-compose):

```dotenv
# Mongo
MONGO_URI=mongodb+srv://...

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# Ports (optional overrides)
AUTH_PORT=4000
REST_PORT=5002
DELIVERY_PORT=5003
PAY_PORT=5004
ORDER_PORT=5005
REALTIME_PORT=5050

# Realtime & Internal
REALTIME_URL=http://localhost:5050
REDIS_URL=redis://localhost:6379
SERVICE_INTERNAL_KEY=super-admin-internal-key

# Service base URLs (used by proxies/clients between services)
AUTH_SERVICE_URL=http://localhost:4000
RESTAURANT_SERVICE_URL=http://localhost:5002
DELIVERY_SERVICE_URL=http://localhost:5003
ORDER_SERVICE_URL=http://localhost:5005

# Email (local SMTP for local dev)
EMAIL_PREFER_SMTP=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_gmail@example.com
SMTP_PASS=your_gmail_app_password   # Gmail App Password 16 ký tự
NOTIFY_FROM_EMAIL="Food Delivery <your_gmail@example.com>"
SUPER_ADMIN_PORTAL_URL=http://192.168.31.132:3000/super-admin/dashboard   # IP máy chạy frontend
RESTAURANT_ONBOARDING_URL=http://192.168.31.132:3000/restaurant/activate

# Delivery Service → Order Service JWT (shared short‑lived tokens)
SHARED_JWT_SECRET=CNPM2025
# or ORDER_SERVICE_JWT_SECRET=CNPM2025

# Geocoding (Delivery Service)
OPENCAGE_API_KEY=<optional>
GEOCODING_COUNTRY_CODE=vn
# GEOCODING_DEFAULT_LAT=...
# GEOCODING_DEFAULT_LNG=...

# Payments & Notifications (Payment Service)
STRIPE_SECRET_KEY=<sk_test_...>
STRIPE_WEBHOOK_SECRET=<whsec_...>
TWILIO_ACCOUNT_SID=<AC...>
TWILIO_AUTH_TOKEN=<...>
TWILIO_PHONE_NUMBER=<+...>
RESEND_API_KEY=<re_...>
```

Frontend `.env` (optional):

```dotenv
REACT_APP_API_BASE=http://localhost:4000
REACT_APP_STRIPE_PUBLISHABLE_KEY=<pk_test_...>
```

---

## 6. Running Locally

From repository root:

```bash
docker-compose up --build
```

- Services: 4000 (auth), 5002 (restaurant), 5003 (delivery), 5004 (payment), 5005 (order)  
- Frontends: 3000 (main), 3001 (delivery)  
- Realtime Gateway: 5050, Redis: 6379

The compose file already starts Redis and Realtime Gateway. Ensure `.env` has valid `MONGO_URI` and `JWT_SECRET`.

---

## 7. Microservices & Endpoints

### 7.1 Auth Service (http://localhost:4000)
- POST `/api/auth/register/customer`
- POST `/api/auth/login`
- GET `/api/auth/customer/profile` (JWT)
- PATCH `/api/auth/customer/profile` (JWT)
- GET `/api/auth/admin/customers` (Admin JWT)
- PATCH `/api/auth/admin/customers/:id/status` (Admin JWT)

### 7.2 Restaurant Service (http://localhost:5002)
- POST `/api/restaurants/register`
- POST `/api/restaurants/login`
- GET `/api/restaurants/profile` (JWT)
- PUT `/api/restaurants/update` (JWT)
- PUT `/api/restaurants/availability` (JWT)
- GET `/api/restaurants/all`
- GET `/api/restaurants/:id`

#### Food Items (http://localhost:5002)
- POST `/api/food-items/create` (Restaurant JWT, file or URL image)
- GET `/api/food-items/` (Restaurant JWT)
- PUT `/api/food-items/:id` (Restaurant JWT)
- PUT `/api/food-items/availability/:id` (Restaurant JWT)
- DELETE `/api/food-items/:id` (Restaurant JWT)
- GET `/api/food-items/all` (Public)
- GET `/api/food-items/restaurant/:restaurantId` (Public)

#### Super Admin (http://localhost:5002)
- POST `/api/superadmin/register|login`
- GET `/api/superadmin/restaurants` (JWT superAdmin)
- GET `/api/superadmin/restaurant/:id` (JWT superAdmin)
- PUT `/api/superadmin/restaurant/:id` (JWT superAdmin)
- PATCH `/api/superadmin/restaurant/:id/approve|reject` (JWT superAdmin)
- DELETE `/api/superadmin/restaurant/:id` (JWT superAdmin)
- Proxy: `/api/superadmin/customers|drivers|orders` (for centralized admin)

### 7.3 Order Service (http://localhost:5005)
- POST `/api/orders` (role: customer)
- GET `/api/orders` (roles: customer, restaurant, driver, admin, superAdmin)
- GET `/api/orders/:id` (roles: as above)
- PATCH `/api/orders/:id` (roles: customer, restaurant, admin, superAdmin)
- PATCH `/api/orders/:id/status` (roles: restaurant, driver, admin, superAdmin)
- DELETE `/api/orders/:id` (roles: customer, restaurant, admin, superAdmin)
- POST `/api/orders/:id/feedback` (role: customer)
- GET `/api/orders/feedback/restaurant` (roles: restaurant, admin, superAdmin)

### 7.4 Delivery Service (http://localhost:5003)
Auth (driver):
- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/auth/profile` (JWT)

Deliveries (driver):
- POST `/api/delivery/create` (JWT)
- GET `/api/delivery` (JWT, list own)
- GET `/api/delivery/stats/summary` (JWT)
- GET `/api/delivery/available` (JWT)
- GET `/api/delivery/order/:orderId` (JWT)
- GET `/api/delivery/:id` (JWT)
- PUT `/api/delivery/:id/status` (JWT)
- DELETE `/api/delivery/:id` (JWT)

Admin drivers:
- GET `/api/admin/drivers` (Admin JWT)
- PATCH `/api/admin/drivers/:id/status` (Admin JWT)
- PATCH `/api/admin/drivers/:id/activity` (Admin JWT)

### 7.5 Payment Service (http://localhost:5004)
- POST `/api/payment/process`
- POST `/api/payment/webhook` (Stripe Webhook, raw body)
- Swagger UI: `http://localhost:5004/api-docs`

> Lưu ý: `orderId` là duy nhất trong Payment; webhook cập nhật `status` = Paid/Failed và có thể gửi SMS/Email.

---

## 8. Realtime Gateway

Service: http://localhost:5050

- GET `/health`
- POST `/internal/events`  
  Headers: `x-service-key: ${SERVICE_INTERNAL_KEY}`  
  Body: `{ event, payload, rooms?: string[], broadcast?: boolean }`

Clients kết nối Socket.IO với JWT và join các room như `user:{id}`, `role:{role}`; Order/Delivery sẽ gọi gateway để phát sự kiện (gateway publish qua Redis rồi emit tới client).

---

## 9. Frontend Setup

```bash
cd frontend
npm install
npm start
```

Visit `http://localhost:3000`.

Login/Register pages under `/auth/login` and `/auth/register`.

---

## 10. Testing & Linting

### Backend (in each `backend/*` folder):

```bash
npm test
npm run lint
```

### Frontend:

```bash
cd frontend
npm test
```

---

## 11. Troubleshooting

- **CORS errors**: Ensure each service uses:

```javascript
app.use(cors({ origin: "http://localhost:3000" }));
```

- **MongoDB connectivity**: Whitelist your IP/`0.0.0.0/0` in Atlas for development.

- **Stripe webhooks (local)**:

```bash
stripe listen --forward-to localhost:5004/api/payment/webhook
```

- **Geocoding**: Set `OPENCAGE_API_KEY` or provide `GEOCODING_DEFAULT_LAT/LNG` fallback.

- **Realtime**: Ensure `REDIS_URL` is reachable and `SERVICE_INTERNAL_KEY` matches across services.

- **Email (local dev)**: Nếu chưa có domain riêng, bật `EMAIL_PREFER_SMTP=true` và cấu hình `SMTP_HOST/PORT/USER/PASS` với Gmail App Password. Kiểm tra log `activation.deliveryStatus` sau khi Super Admin duyệt để chắc chắn mail đã được gửi (`sent`) — nếu thấy `simulated/failed`, hãy kiểm tra lại `.env` và giá trị App Password.
- **Link truy cập trên điện thoại**: Để admin/nhà hàng mở các link trong email trên điện thoại, đặt `SUPER_ADMIN_PORTAL_URL` và `RESTAURANT_ONBOARDING_URL` bằng IP nội bộ của máy chạy frontend (ví dụ `http://192.168.xx.xx:3000/...`) và đảm bảo các thiết bị cùng mạng Wi-Fi.

---

## 12. Demo & Submission

- **GitHub Repo**: [https://github.com/thungnguyen/FoodDelivery](https://github.com/thungnguyen/FoodDelivery)
