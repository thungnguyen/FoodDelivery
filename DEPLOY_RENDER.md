# Hướng dẫn triển khai SkyDish lên Render.com

Tài liệu này hướng dẫn chi tiết cách đưa toàn bộ hệ thống (microservices + frontend) lên Render.com mà không dùng `docker-compose`. Render không hỗ trợ Compose trực tiếp, nên ta tạo nhiều dịch vụ riêng (Web Service/Private Service/Static Site) và kết nối qua internal URL.

## 1) Chuẩn bị
- Tài khoản Render, quyền liên kết GitHub/GitLab với repo này.
- MongoDB Atlas (hoặc MongoDB tự quản) có connection string `mongodb+srv://...`.
- Stripe (Secret, Publishable, Webhook Secret), Twilio, Resend/SMTP (nếu dùng email), OpenCage (geocoding).
- Domain/frontend URL dự kiến để cấu hình CORS: ví dụ `https://app.onrender.com`, `https://driver.onrender.com`.
- Node 20 cho tất cả Web Service.

## 2) Tạo hạ tầng nền tảng trên Render
Render cần một Redis + RabbitMQ chạy dưới dạng Private Service để các service trao đổi nội bộ.

### 2.1 Redis (private)
1. Dashboard Render → **New +** → **Private Service**.
2. **Environment**: Docker.  
3. **Image**: `redis:7-alpine`.  
4. **Start Command**: để trống (mặc định).  
5. Chọn vùng (Region) giống các service còn lại → **Create**.
6. Sau khi chạy, copy **Internal URL** dạng `redis://<host>:6379` (có thể cần thêm mật khẩu nếu cấu hình). Ghi lại cho biến `REDIS_URL`.

### 2.2 RabbitMQ (private)
1. Dashboard → **New +** → **Private Service**.
2. **Environment**: Docker.  
3. **Image**: `rabbitmq:3.13-management-alpine`.  
4. **Env Vars** (tùy chọn nhưng nên đặt):  
   - `RABBITMQ_DEFAULT_USER=<tên-user>`  
   - `RABBITMQ_DEFAULT_PASS=<mật-khẩu-mạnh>`  
5. **Start Command**: để trống.  
6. Tạo xong, copy **Internal URL** dạng `amqp://<user>:<pass>@<host>:5672` cho biến `RABBITMQ_URL`.

> Mẹo: đặt 2 service này vào cùng Region và gán cùng **Environment Group** với các backend để DNS nội bộ nhanh hơn.

## 3) Chuẩn bị Environment Group dùng chung
Tạo 1 **Environment Group** (ví dụ `skydish-shared`) rồi thêm các biến dưới. Khi tạo từng service, chỉ cần attach group và thêm biến đặc thù.

### Biến hạ tầng & bảo mật chung
- `NODE_ENV=production`
- `JWT_SECRET=<chuỗi-bí-mật>`
- `JWT_EXPIRES_IN=120d`
- `SERVICE_INTERNAL_KEY=<chuỗi-cho-giao-tiếp-nội-bộ>`
- `ALLOWED_ORIGINS=https://app.onrender.com,https://driver.onrender.com` (cập nhật theo domain thực)
- `REDIS_URL=<Internal URL từ Redis>`
- `RABBITMQ_URL=<Internal URL từ RabbitMQ>`
- `RABBITMQ_EXCHANGE=app.direct`

### Biến MongoDB
- `MONGO_URI=<connection-string-chung>`  
- Hoặc tách riêng: `AUTH_MONGO_URI`, `RESTAURANT_MONGO_URI`, `ORDER_MONGO_URI`, `DELIVERY_MONGO_URI`, `PAYMENT_MONGO_URI`, `PROMOTION_MONGO_URI`, `SETTLEMENT_MONGO_URI`.
- Tùy chọn đặt tên DB: `AUTH_DB_NAME`, `RESTAURANT_DB_NAME`, `ORDER_DB_NAME`, `DELIVERY_DB_NAME`, `PAYMENT_DB_NAME`, `PROMOTION_DB_NAME`, `SETTLEMENT_DB_NAME`.

### Biến liên dịch vụ
- `AUTH_SERVICE_URL=https://auth-service.onrender.com`
- `RESTAURANT_SERVICE_URL=https://restaurant-service.onrender.com`
- `ORDER_SERVICE_URL=https://order-service.onrender.com/api/orders`
- `DELIVERY_SERVICE_URL=https://delivery-service.onrender.com/api`
- `PAYMENT_SERVICE_URL=https://payment-service.onrender.com`
- `PROMOTION_SERVICE_URL=https://promotion-service.onrender.com`
- `REALTIME_URL=https://realtime-gateway.onrender.com`
- `ORDER_SERVICE_JWT_SECRET` hoặc `SHARED_JWT_SECRET` (nếu muốn tách với `JWT_SECRET`)
- `SERVICE_INTERNAL_KEY=<giống ở trên>`

### Email/SMS/Stripe/Geocoding
- `RESEND_API_KEY=<resend-key>` (nếu dùng Resend)
- SMTP: `EMAIL_PREFER_SMTP=true|false`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `NOTIFY_FROM_EMAIL`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- Stripe backend: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DEFAULT_PAYMENT_CURRENCY` (ví dụ `usd` hoặc `vnd`)
- Stripe frontend: `REACT_APP_STRIPE_PUBLISHABLE_KEY=<pk_test_...>`
- Geocoding: `OPENCAGE_API_KEY`, `GEOCODING_COUNTRY_CODE=vn`, `GEOCODING_DEFAULT_LAT`, `GEOCODING_DEFAULT_LNG`
- Khác: `SUPER_ADMIN_PORTAL_URL`, `RESTAURANT_ONBOARDING_URL`, `ADMIN_NOTIFICATION_EMAILS`

> Lưu ý: không commit giá trị thật, chỉ nhập vào Render.

## 4) Tạo từng Web Service (backend)
Lặp lại bước sau cho mỗi backend:
1. **New + → Web Service** → chọn repo, branch.
2. **Root Directory**: trỏ tới thư mục service (bảng dưới).
3. **Runtime**: Node. **Node Version**: 20.x.
4. **Build Command**: `npm ci --omit=dev`
5. **Start Command**: `npm start`
6. Gắn **Environment Group** `skydish-shared`.
7. Thêm biến riêng của service (PORT, URL nội bộ, queue, v.v.).

### Bảng cấu hình nhanh
| Service | Root Directory | PORT mặc định | Biến đặc thù cần kiểm tra |
|---------|----------------|---------------|---------------------------|
| Auth | `backend/auth-service` | 5000 | `AUTH_MONGO_URI`/`AUTH_DB_NAME`, `ALLOWED_ORIGINS`, email (`RESEND_API_KEY`/SMTP), `SERVICE_INTERNAL_KEY` |
| Restaurant | `backend/restaurant-service` | 5002 | `RESTAURANT_MONGO_URI`/`RESTAURANT_DB_NAME`, `AUTH_SERVICE_URL`, `DELIVERY_SERVICE_URL`, `ORDER_SERVICE_URL`, `SUPER_ADMIN_PORTAL_URL`, `RESTAURANT_ONBOARDING_URL`, `ADMIN_NOTIFICATION_EMAILS`, email/SMTP, `SERVICE_INTERNAL_KEY` |
| Order | `backend/order-service` | 5005 | `ORDER_MONGO_URI`/`ORDER_DB_NAME`, `REALTIME_SERVICE_URL` (đặt `https://realtime-gateway.onrender.com`), `PROMOTION_SERVICE_URL`, `PLATFORM_COMMISSION_RATE`, `RABBITMQ_PAYMENT_QUEUE`, `RABBITMQ_DELIVERY_QUEUE`, `SERVICE_INTERNAL_KEY`, `JWT_SECRET` hoặc `SHARED_JWT_SECRET` |
| Delivery (backend) | `delivery-service/backend` | 5003 | `DELIVERY_MONGO_URI`/`DELIVERY_DB_NAME`, `ORDER_SERVICE_URL`, `ORDER_SERVICE_JWT_SECRET` hoặc `SHARED_JWT_SECRET`, `RESTAURANT_SERVICE_URL`, `RABBITMQ_DELIVERY_QUEUE`, geocoding keys, `SERVICE_INTERNAL_KEY`, `JWT_SECRET` |
| Payment | `backend/payment-service` | 5004 | `PAYMENT_MONGO_URI`/`PAYMENT_DB_NAME`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TWILIO_*`, `RESEND_API_KEY` hoặc SMTP, `RABBITMQ_PAYMENT_QUEUE`, `ALLOWED_ORIGINS` |
| Promotion | `backend/promotion-service` | 5006 | `PROMOTION_MONGO_URI`/`PROMOTION_DB_NAME`, `RABBITMQ_URL`, `RABBITMQ_EXCHANGE` |
| Settlement | `backend/settlement-service` | 5007 | `SETTLEMENT_MONGO_URI`/`SETTLEMENT_DB_NAME`, `SETTLEMENT_PERIOD` (day/week), `SETTLEMENT_CRON` (mặc định `0 3 * * *`), `SETTLEMENT_COMMISSION_RATE`, `RESTAURANT_SHIPPING_RATE`, `RABBITMQ_URL` |
| Realtime Gateway | `backend/realtime-gateway` | 5050 | `REDIS_URL`, `RABBITMQ_URL`, `JWT_SECRET`, `SERVICE_INTERNAL_KEY`, `ALLOWED_ORIGINS` (đặt domain frontend), `RABBITMQ_REALTIME_QUEUE` |

> Mẹo: Render tự set biến `PORT`, nhưng code vẫn nhận `process.env.PORT || <mặc định>`. Không cần mở cổng thủ công; chỉ cần khớp start command và env.

## 5) Triển khai frontend chính (khách/nhà hàng/super admin)
1. **New + → Static Site**.
2. **Root Directory**: `frontend`.
3. **Build Command**: `npm ci && npm run build`.
4. **Publish Directory**: `build`.
5. **Env Vars (build-time)**: đặt các URL public của backend:
   - `REACT_APP_AUTH_URL=https://auth-service.onrender.com`
   - `REACT_APP_RESTAURANT_URL=https://restaurant-service.onrender.com`
   - `REACT_APP_ORDER_URL=https://order-service.onrender.com`
   - `REACT_APP_PAYMENT_URL=https://payment-service.onrender.com`
   - `REACT_APP_PROMOTION_URL=https://promotion-service.onrender.com`
   - `REACT_APP_SETTLEMENT_URL=https://settlement-service.onrender.com`
   - `REACT_APP_DELIVERY_URL=https://delivery-service.onrender.com`
   - `REACT_APP_REALTIME_URL=https://realtime-gateway.onrender.com`
   - `REACT_APP_STRIPE_PUBLISHABLE_KEY=<pk_test_...>`
6. Deploy và ghi lại domain (dùng cho `ALLOWED_ORIGINS` của backend).

## 6) Triển khai frontend tài xế
1. **New + → Static Site**.
2. **Root Directory**: `delivery-service/frontend`.
3. **Build Command**: `npm ci && npm run build`.
4. **Publish Directory**: `build`.
5. **Env Vars (build-time)**:
   - `REACT_APP_DELIVERY_API_URL=https://delivery-service.onrender.com/api`
   - `REACT_APP_DELIVERY_SOCKET_URL=https://realtime-gateway.onrender.com` (nếu muốn nhận realtime qua gateway; nếu dùng trực tiếp delivery backend thì đặt URL đó)
6. Deploy và thêm domain vào `ALLOWED_ORIGINS`.

## 7) Cập nhật webhook & CORS
- **Stripe Webhook**: trong Stripe Dashboard → Developers → Webhooks → thêm endpoint `https://payment-service.onrender.com/api/webhook/stripe` (hoặc path webhook hiện có), đặt events cần lắng nghe, rồi copy `STRIPE_WEBHOOK_SECRET` vào env Payment Service.
- **CORS**: đảm bảo mọi backend có `ALLOWED_ORIGINS` chứa domain của cả hai frontend. Nếu cần tạm thời mở rộng, dùng `CORS_ALLOW_ALL=true` (Auth Service hỗ trợ) rồi thu hẹp lại sau khi test.

## 8) Kiểm tra sau deploy
- Vào từng Web Service trên Render, mở **Logs** kiểm tra kết nối Mongo/Rabbit/Redis thành công.
- Gọi thử API: `https://auth-service.onrender.com/health` (hoặc endpoint gốc `/api/auth/login`), `https://restaurant-service.onrender.com/api/restaurants`.
- Đăng ký/đăng nhập trên frontend, tạo đơn, kiểm tra thanh toán sandbox, theo dõi cập nhật trạng thái giao hàng.
- Kiểm tra bảng hàng đợi trong RabbitMQ (tab Management) xem có thông điệp đi/đến.

## 9) Ghi chú vận hành
- Nếu dùng gói Free, service ngủ sau ~15 phút không traffic; nên bật cron ping hoặc nâng gói để tránh delay.
- Giới hạn kết nối Mongo/Redis: ưu tiên reuse connection (đã sẵn trong code), tránh tạo cluster quá nhỏ.
- Bật Auto-Deploy on Push để Render tự build khi có commit mới; nếu có thay đổi env, redeploy thủ công.

Hoàn thành các bước trên sẽ giúp toàn bộ hệ thống chạy đầy đủ trên Render.com với kết nối nội bộ an toàn và frontend tách biệt.
