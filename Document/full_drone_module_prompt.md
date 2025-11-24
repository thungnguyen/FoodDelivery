
# 🚀 FULL DRONE DELIVERY MODULE PROMPT FOR CODEX

Tài liệu dưới đây bao gồm toàn bộ nội dung đầy đủ theo yêu cầu của bạn, bao gồm:
- Toàn bộ UI Drone Center
- Toàn bộ Backend Drone API
- Toàn bộ Socket.IO event
- Toàn bộ Integration vào Order Flow
- Toàn bộ Realtime Map & Drone Simulator
- Toàn bộ yêu cầu quan trọng cho Codex

Bạn có thể đưa file này cho Codex để nó hiểu và triển khai đúng theo trình tự.

---

# 🟦 PART 1 — Drone Center UI (Module UI riêng biệt)

Tạo module giao diện mới tên **Drone Center**, tách khỏi super-admin.

Đặt trong thư mục:
```
/src/pages/drone-center/
```

Gồm 5 trang chính:

---

## 1) `/drone-center/dashboard`

Thông tin thống kê:
- Tổng số drone
- Drone đang bay
- Drone idle
- Drone returning
- Drone offline (không cập nhật > 10 giây)
- Card cảnh báo pin thấp (< 30%)

---

## 2) `/drone-center/drones`

Bảng quản lý drone:

| Drone ID | Name | Battery | Status | Hub | Current Order | Last Update | View Map |

Chức năng:
- Realtime cập nhật từ socket `"drone-location-update"`
- Nút “View Map” mở modal xem drone trên map

---

## 3) `/drone-center/hubs`

Danh sách Hub:

| Hub | Vị trí | Bán kính phục vụ | Số Drone | Edit |

Có form:
- Thêm Hub
- Chỉnh Hub
- Xóa Hub

---

## 4) `/drone-center/map`

Bản đồ drone realtime:

Hiển thị:
- Drone markers
- Hub markers
- Nhà hàng (nếu có order)
- Khách hàng (điểm giao)
- Đường bay drone

Dùng Google Maps hoặc Leaflet (theo project hiện tại).

Lắng nghe Socket:
```
on("drone-location-update", updateMarker)
```

---

## 5) `/drone-center/simulator`

Trang mô phỏng drone:

- Chọn drone
- Nhập route (hub → restaurant → customer → hub)
- Có nút **Start Simulation**
- Gửi GPS giả định mỗi 500ms → `/api/drone/update-location`
- Drone chạy mô phỏng trên bản đồ thật

---

# 🟩 PART 2 — Backend Drone API (Model + CRUD + Socket)

---

## 1) Tạo Drone Model

```
droneId: String
name: String
battery: Number
status: "idle" | "assigned" | "enroute_to_restaurant" | "picking" | "delivering" | "returning"
location: { lat, lng }
hubId: ObjectId
updatedAt: Date
```

---

## 2) Tạo Hub Model

```
name
location: { lat, lng }
radiusKm
```

---

## 3) API cho Drone

```
GET /api/drones
POST /api/drones
PUT /api/drones/:id
DELETE /api/drones/:id
```

---

## 4) API cho Hub

```
GET /api/hubs
POST /api/hubs
PUT /api/hubs/:id
DELETE /api/hubs/:id
```

---

## 5) API cập nhật GPS của drone

```
POST /api/drone/update-location
```

Body:
```
{
  "droneId": "DR-001",
  "lat": 10.12345,
  "lng": 106.12345,
  "battery": 85
}
```

Backend:
- Lưu vào DB
- Emit socket `"drone-location-update"`

---

## 6) Socket.IO

```
io.emit("drone-location-update", { droneId, lat, lng, battery })
```

---

# 🟧 PART 3 — Tích hợp Drone vào Quy trình Order (Flow mới)

Quy trình hiện tại:
1. pending  
2. restaurant_confirmed  
3. preparing  
4. ready_for_delivery  
5. delivering  
6. completed  

Cần thêm Drone giữa bước 4 và 5.

---

## 1) Trạng thái order mới:

```
waiting_for_drone
drone_assigned
drone_enroute_to_restaurant
drone_arrived_restaurant
drone_picked_food
drone_delivering
drone_arrived_customer
completed
```

---

## 2) Khi nhà hàng bấm "Hoàn tất chế biến"

Thay vì chuyển sang giao shipper:

```
order.status = "waiting_for_drone"
order.droneStatus = "waiting_for_drone"
```

---

## 3) API assign drone

```
POST /api/admin/drone/assign
```

Logic:
- Tìm drone idle gần nhất
- Gán vào order
- Cập nhật:
```
order.droneId = drone._id
order.droneStatus = "drone_assigned"
drone.status = "assigned"
```

---

## 4) API drone đến nhà hàng

```
POST /api/drone/arrived-restaurant
```

Cập nhật:
```
order.droneStatus = "drone_arrived_restaurant"
drone.status = "picking"
```

---

## 5) Nhà hàng giao cho drone

```
POST /api/order/drone-pickup
```

Cập nhật:
```
order.droneStatus = "drone_picked_food"
drone.status = "delivering"
```

---

## 6) Drone đến khách

```
POST /api/drone/arrived-customer
```

---

## 7) Khách bấm "Đã nhận hàng"

```
order.status = "completed"
drone.status = "returning"
```

---

## 8) Drone quay về hub

```
POST /api/drone/return
```

Cập nhật:
```
drone.status = "idle"
```

---

# 🟨 PART 4 — Bản đồ Drone Real-time + Giả lập

Frontend yêu cầu:

- Google Maps hoặc Leaflet
- Socket.IO
- Marker di chuyển theo GPS

---

## Component: `DroneTrackingMap.jsx`

- Lắng nghe `drone-location-update`
- Cập nhật marker realtime
- Highlight drone được chọn

---

## Simulator:

Chạy setInterval mỗi 500ms:

```
POST /api/drone/update-location
```

Dữ liệu:
- lat
- lng
- battery

---

# 🟥 PART 5 — Không phá hệ thống cũ

RẤT QUAN TRỌNG:

- Không chỉnh cashflow
- Không chỉnh payout
- Không chỉnh merchant
- Không chỉnh phần admin cũ
- Không đổi tên file cũ
- Chỉ thêm module drone

---

# 🟪 PART 6 — Yêu cầu chung cho toàn bộ module

- Giữ nguyên cấu trúc project
- Tạo folder drone-center riêng
- Các API drone phải độc lập
- Mọi phần drone integration chỉ xảy ra sau “Hoàn tất chế biến”
- UI admin, UI merchant, UI customer không bị ảnh hưởng ngoài phần tracking

---

# 🔚 KẾT

Hãy implement đầy đủ **UI + Backend + API + Socket + Map + Simulator + Order Flow** theo toàn bộ mô tả phía trên.

Module drone phải hoạt động độc lập và có thể thay drone giả lập bằng drone thật mà không chỉnh sửa backend/UI.

