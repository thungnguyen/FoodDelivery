# Giải thích kiến trúc & công nghệ SkyDish

Dự án SkyDish hiện thực một nền tảng đặt đồ ăn sử dụng kiến trúc microservices. Toàn bộ source được chia thành nhiều dịch vụ Node.js độc lập, một gateway realtime và hai ứng dụng React (web khách hàng & web tài xế). Tài liệu này mô tả mục tiêu, công nghệ, cấu trúc thư mục và logic chính của từng phần.

---

## 1. Mục tiêu & luồng nghiệp vụ

- **Khách hàng**: đăng ký/đăng nhập, duyệt nhà hàng & món ăn, đặt đơn, thanh toán, theo dõi trạng thái, phản hồi.
- **Nhà hàng**: quản trị hồ sơ, menu, trạng thái hoạt động, xem & xử lý đơn.
- **Tài xế**: đăng ký/đăng nhập, nhận giao đơn, cập nhật trạng thái giao hàng, xem thống kê.
- **Super Admin/Admin**: duyệt tài khoản nhà hàng/tài xế, xem báo cáo, proxy tra cứu khách hàng/đơn.

Các dịch vụ giao tiếp chủ yếu qua HTTP REST, chia sẻ JWT để xác thực. Những sự kiện realtime (thay đổi trạng thái đơn, thông báo giao hàng) đi qua **Realtime Gateway** dùng Socket.IO + Redis pub/sub.

---

## 2. Công nghệ cốt lõi

| Tầng | Công nghệ chính | Vai trò |
|------|-----------------|---------|
| Backend | Node.js 20, Express.js, Mongoose, JWT, bcrypt/bcryptjs | Dịch vụ Auth, Restaurant, Order, Payment, Delivery, Realtime |
| Database | MongoDB | Lưu người dùng, nhà hàng, món ăn, đơn hàng, tài xế |
| Realtime | Socket.IO, Redis (ioredis) | Phát sự kiện trạng thái đơn & giao hàng |
| Thanh toán | Stripe (PaymentIntent + Webhook), Twilio, Resend | Xử lý thanh toán, gửi thông báo |
| Frontend | React, React Router, Context API, react-icons | Ứng dụng khách hàng & restaurant portal |
| DevOps | Docker Compose, dotenv | Dựng toàn bộ stack, cấu hình môi trường |
| Tài liệu | problem_analysis, Document, README | Đặc tả nghiệp vụ & hướng dẫn triển khai |

---

## 3. Cấu trúc thư mục tổng quát

/ (repo root)
├── backend/ # Tập hợp các microservice Node.js
│ ├── auth-service/
│ ├── restaurant-service/
│ ├── order-service/
│ ├── payment-service/
│ └── realtime-gateway/
├── delivery-service/ # Ứng dụng riêng cho tài xế (backend + frontend)
├── frontend/ # Ứng dụng React chính (khách hàng + portal)
├── Document/ # Tài liệu báo cáo, biểu mẫu
├── problem_analysis/ # Phân tích nghiệp vụ, luồng tiền,...
├── seed_database/ # Script seed dữ liệu (nếu cần)
├── docker-compose.yml # Dựng toàn bộ stack bằng container
├── .env # Biến môi trường dùng chung
└── README.md # Hướng dẫn tổng quan



---

## 4. Dịch vụ backend trong `backend/`

### 4.1 `auth-service`
- **Công nghệ**: Express 5, Mongoose, bcryptjs, JWT, dotenv.
- **Mục tiêu**: quản lý người dùng (khách, nhà hàng, tài xế, admin), phát hành/giải mã JWT, phân quyền.
- **Cấu trúc**:
  - `config/db.js`: kết nối MongoDB.
  - `models/`: User, Role, RefreshToken (nếu có).
  - `controllers/customerController.js`: đăng ký, đăng nhập, cập nhật hồ sơ, đổi mật khẩu.
  - `middlewares/`: xác thực JWT theo vai trò.
  - `routes/authRoutes.js`: gom các endpoint `/api/auth`.
- **Luồng chính**:
  1. Đăng ký: bcrypt hash mật khẩu, lưu Mongo, gửi JWT.
  2. Đăng nhập: so khớp hash, trả access token + optional refresh.
  3. Profile: middleware đọc JWT, lấy thông tin từ DB.

### 4.2 `restaurant-service`
- **Công nghệ**: Express, Multer (upload ảnh), Mongoose.
- **Chức năng**: quản lý nhà hàng, menu, super admin approval.
- **File đáng chú ý**:
  - `src/server.js`: khởi động Express, CORS, logging.
  - `controllers/restaurantController.js`: CRUD nhà hàng, bật/tắt trạng thái, lấy danh sách công khai (`/api/restaurants/all`).
  - `controllers/foodItemController.js`: CRUD món, toggle availability.
  - `routes/restaurantRoutes.js`, `routes/foodItemRoutes.js`, `routes/superAdminRoutes.js`.
  - `middleware/auth.js`: xác thực nhà hàng/super admin.
- **Mối liên hệ**: Order service gọi sang để lấy giá món; frontend khách dùng endpoint công khai.

### 4.3 `order-service`
- **Công nghệ**: Express, Mongoose, các service tổ chức tài chính, fetch tới dịch vụ khác.
- **Nhiệm vụ**: tạo đơn hàng, cập nhật trạng thái, ghi nhận feedback, tích hợp tính toán doanh thu/hoa hồng.
- **Cấu trúc**:
  - `index.js`: mount `/api/orders`.
  - `models/orderModel.js`: schema đơn có items, giá, trạng thái, lịch sử.
  - `controllers/orderController.js`: business logic từng vai trò.
  - `services/orderFinanceService.js`: chuẩn hoá ledger, chia hoa hồng, cập nhật ví (theo `config/financeConfig.js`).
  - `utils/serviceUrls.js`: base URL tham chiếu tới các microservice khác.
- **Luồng logic**:
  1. Khách tạo đơn -> tính tổng tiền, lưu DB -> gọi Payment Service nếu thanh toán online.
  2. Nhà hàng/tài xế cập nhật trạng thái -> bắn sự kiện qua Realtime Gateway.
  3. Khi đơn hoàn tất -> ghi ledger (chia hoa hồng platform, nhà hàng, tài xế).
  4. `/feedback` -> lưu vào collection phù hợp, phục vụ báo cáo.

### 4.4 `payment-service`
- **Công nghệ**: Express, Stripe SDK, Swagger, Body-parser raw.
- **Chức năng**: xử lý thanh toán (Stripe PaymentIntent), webhook xác nhận, gửi SMS/Email.
- **Thành phần chính**:
  - `server.js` (hoặc tương tự): cấu hình Express, Swagger UI `/api-docs`.
  - `controllers/paymentController.js`: tạo intent, xác thực webhook, cập nhật order.
  - `routes/paymentRoutes.js`: `/api/payment/process`, `/api/payment/webhook`.
  - Tích hợp Twilio/Resend để thông báo thanh toán thành công/thất bại.

### 4.5 `delivery-service` (bên trong `backend/` – khác với dự án con tài xế)
- **Chức năng**: quản lý tài xế, phân công đơn vận chuyển.
- **Cấu trúc**:
  - `controllers/deliveryController.js`: driver CRUD, nhận đơn, cập nhật trạng thái giao.
  - `routes/deliveryRoutes.js`: tách driver auth, admin driver, operations.
  - `middleware/authMiddleware.js`: JWT cho tài xế.
  - `services/`: có thể gọi Order Service/Realtime Gateway để đồng bộ.
- **Luồng chính**: tài xế đăng nhập -> xem đơn khả dụng -> nhận đơn -> cập nhật `status` (Picked, OnTheWay, Delivered) -> Gateway phát sự kiện cho khách.

### 4.6 `realtime-gateway`
- **Công nghệ**: Express + Socket.IO + ioredis + JWT (module ES).
- **Mục tiêu**: làm hub realtime duy nhất. Các dịch vụ backend gửi sự kiện qua HTTP `/internal/events`, gateway phát tới client đã connect.
- **Logic**:
  1. Client (frontend) kết nối Socket.IO với JWT -> gateway verify, join room `user:{id}` & `role:{role}`.
  2. Dịch vụ (Order, Delivery…) gọi POST `/internal/events` kèm `x-service-key`.
  3. Gateway publish message lên Redis channel `realtime.events`.
  4. Subscriber nhận, emit tới rooms tùy payload.
- **server.js** (đã xem): thể hiện luồng xác thực socket, subscribe/unsubscribe thêm, endpoint health-check.

---

## 5. Dự án con `delivery-service/`

### 5.1 Backend (dịch vụ tài xế)
- Tương tự microservice nhưng tách riêng project.
- `src/app.js` tạo Express app, `server.js` gọi `app.listen`.
- Các thư mục `controllers/`, `routes/`, `services/` xử lý đăng ký tài xế, nhận đơn, thống kê.
- Cài đặt `.env` riêng để cấu hình Mongo, JWT secret cho tài xế.
- Giao tiếp với Order Service qua HTTP (cập nhật order assignment) và Realtime Gateway để thông báo.

### 5.2 Frontend (ứng dụng web tài xế)
- `src/`: React Router, hooks quản lý trạng thái phiên đăng nhập tài xế, trang Dashboard/Orders/Profile.
- Sử dụng fetch/axios gọi backend tài xế.
- Có build riêng chạy trên port 3001 (tham chiếu trong README).

---

## 6. Ứng dụng React chính trong `frontend/`

- **Tech stack**: React Router DOM, Context API (ví dụ `pages/contexts/CartContext`), fetch API, react-icons, CSS Module/inline style.
- **Điểm nổi bật**:
  - `src/App.js`: định nghĩa routing cho toàn bộ vai trò (customer, restaurant, admin).
  - `pages/customer/`: các trang khách hàng (`customerHome.js`, `foodItemList.js`, `AddToCartPage.js`, `FoodDetailPage.js`).
  - `pages/restaurant/`: dashboard, onboarding, styles (`styles/rdashboard.css`).
  - `pages/auth/CustomerProfile.jsx`: cập nhật hồ sơ.
  - `components/`: form đặt hàng, chi tiết đơn, modal.
  - `utils/serviceUrls.js`: base URL theo `.env` frontend.
- **Quản lý trạng thái**:
  - `CartContext`: lưu giỏ hàng trong React context + localStorage.
  - Token lưu dưới localStorage, helper `utils/authTokens.js`.
- **Realtime**: frontend kết nối Socket.IO tới gateway (thường trong 1 hook, không hiển thị ở file đang mở nhưng pattern chung).
- **Triển khai UI**: nhiều inline style custom. Những thay đổi gần đây thêm header/footer cố định cho `/customer/home`.

---

## 7. Thư mục bổ trợ

- `problem_analysis/`: ví dụ `flow-money.md` mô tả luồng tiền, tỷ lệ chia sẻ, dùng tham chiếu cho `orderFinanceService`.
- `Document/`: chứa báo cáo, đặc tả nghiệp vụ, mockup.
- `seed_database/`: script seeding Mongo (thường `*.js` hoặc JSON).
- `docker-compose.yml`: dựng Mongo, Redis, Stripe mock (nếu có), từng microservice + frontend. Dùng biến trong `.env`.
- `.env` gốc: khai báo cổng, URI, khóa dùng chung (`SERVICE_INTERNAL_KEY`, base URLs).

---

## 8. Tích hợp & bảo mật

- **Xác thực**: mỗi request protected kèm header `Authorization: Bearer <JWT>`, middleware của từng dịch vụ kiểm tra vai trò (`AUTH_ROLES`).
- **Giao tiếp dịch vụ**: các service sử dụng URL từ `.env` (vd `RESTAURANT_SERVICE_URL`) để fetch chéo (order -> restaurant để lấy menu, order -> payment).
- **Realtime**: backend đăng sự kiện qua internal key, frontend phải gửi JWT hợp lệ khi kết nối socket.
- **Thanh toán**: Payment service phê duyệt với Stripe, webhook cập nhật order status = `PAID`/`FAILED`, đồng thời gửi Twilio/Resend.
- **Tài chính**: `orderFinanceService.js` tạo ledger entries dựa trên config (`DEFAULT_COMMISSION_RATE`, `LEDGER_ENTRY_TYPES`), chuẩn bị cho hệ thống kế toán/đối soát sau này.

---

## 9. Hướng dẫn triển khai & phát triển

1. Thiết lập `.env` gốc + `.env` từng service (Mongo URI, JWT secret, Stripe key, Redis URL…).
2. Chạy `docker-compose up --build` để dựng toàn bộ, hoặc chạy thủ công từng dịch vụ với `npm install` + `npm run dev`.
3. Frontend chính: `cd frontend && npm start` (port 3000).
4. Delivery frontend: `cd delivery-service/frontend && npm start` (port 3001).
5. Kiểm tra realtime: đảm bảo Redis chạy, gateway port 5050 mở, frontend kết nối Socket.IO.
6. Phần mở rộng:
   - Bổ sung kiểm thử (hiện hầu hết service chưa có test).
   - Chuẩn hoá log/observability.
   - Tách cấu hình UI sang CSS modules thay vì inline.

---

## 10. Tổng kết

SkyDish chia nhỏ nghiệp vụ đặt đồ ăn thành các microservice độc lập:
- **Auth** quản lý danh tính & JWT.
- **Restaurant** quản lý đối tác & menu.
- **Order** điều phối đơn hàng, chia sẻ doanh thu.
- **Delivery** vận hành đội ngũ giao hàng.
- **Payment** xử lý thanh toán online & thông báo.
- **Realtime Gateway** làm trung gian sự kiện realtime.
- **Các frontend React** cung cấp trải nghiệm cho khách, nhà hàng, tài xế.

Việc phân tách này giúp hệ thống dễ mở rộng, triển khai độc lập từng thành phần và phù hợp cho việc scale theo tải từng nghiệp vụ.