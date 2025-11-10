# Tài liệu Hệ thống Nền tảng Giao Đồ Ăn

## 1. Giới thiệu
_Mục này sẽ được hoàn thiện theo yêu cầu ở các bước tiếp theo._

## 2. Product Requirements Document (PRD)

### 2.1 Tổng quan sản phẩm
SkyDish là nền tảng đặt và giao đồ ăn theo mô hình đám mây, được xây dựng trên kiến trúc microservices Node.js để phục vụ Khách hàng, Quản trị Nhà hàng, Tài xế giao hàng và Super Admin thông qua các dịch vụ chuyên biệt cho xác thực, quản lý nhà hàng, đơn hàng, giao vận, thanh toán, sự kiện realtime và hai frontend React riêng biệt (README.md:3, README.md:4, README.md:33, README.md:34, README.md:35, README.md:36, README.md:37, README.md:38, README.md:39, README.md:45, README.md:46, README.md:47, README.md:49, README.md:51). Hệ thống tận dụng MongoDB, bảo mật JWT, thanh toán Stripe, thông báo Twilio/Resend, cổng Socket.IO với Redis và Docker Compose để đảm bảo khả năng mở rộng và thực thi quy trình hoàn tất đơn dựa trên sự kiện cho mọi vai trò (README.md:45, README.md:46, README.md:47, README.md:48, README.md:49, README.md:50, README.md:51, README.md:52, README.md:112, README.md:168, README.md:171, README.md:243, README.md:244, README.md:245, README.md:252, README.md:253, README.md:254, README.md:255, README.md:256, README.md:257, README.md:258, README.md:259).

### 2.2 Tuyên bố vấn đề
Người dùng đô thị kỳ vọng tìm quán nhanh, cập nhật trạng thái minh bạch và thanh toán an toàn, trong khi nhà hàng độc lập và đội ngũ giao hàng lại phải dựa vào những công cụ rời rạc, quy trình duyệt thủ công và bàn giao chậm trễ. Thiếu một nền tảng hợp nhất, nhận biết vai trò khiến chất lượng dịch vụ không ổn định, khó giám sát và thất thoát doanh thu cho nhà vận hành. Nền tảng cần gom các luồng onboarding, đặt món, điều phối giao nhận và thanh toán vào một hệ thống microservices chặt chẽ nhưng vẫn đảm bảo tốc độ.

### 2.3 Mục tiêu và chỉ số thành công
- **Tính tin cậy của đặt hàng:** ≥99% yêu cầu tạo đơn phải thành công trong mỗi cửa sổ 5 phút để bảo chứng niềm tin thị trường (nhờ luồng riêng của Order Service; README.md:213).
- **Độ trễ realtime:** 90% sự kiện thay đổi trạng thái phải tới khách, nhà hàng và tài xế trong ≤5 giây thông qua Realtime Gateway (README.md:252, README.md:253, README.md:254, README.md:255, README.md:256, README.md:257, README.md:258, README.md:259).
- **Tốc độ duyệt nhà hàng:** Thời gian trung bình từ lúc đăng ký tới khi Super Admin ra quyết định <1 ngày làm việc bằng các endpoint phê duyệt (README.md:186, README.md:187, README.md:188, README.md:189, README.md:190, README.md:191, README.md:192, README.md:203, README.md:204, README.md:205, README.md:206, README.md:207, README.md:208, README.md:209, README.md:210, README.md:211).
- **Đảm bảo thanh toán:** Sai lệch giữa giao dịch Stripe và trạng thái đơn nội bộ <0.5% nhờ dịch vụ thanh toán chuyên trách và webhook đối soát (README.md:141, README.md:142, README.md:143, README.md:243, README.md:244, README.md:245).
- **Độ phản hồi của đội xe:** Thời gian nhận đơn trung vị của tài xế với yêu cầu giao khả dụng <2 phút bằng các API phân phối giao hàng (README.md:229, README.md:230, README.md:231, README.md:232, README.md:233, README.md:234, README.md:235, README.md:236).

### 2.4 Chân dung người dùng
#### Khách hàng
- **Mô tả:** Người dùng ưu tiên thiết bị di động để xem menu, đặt món, theo dõi trạng thái và gửi phản hồi trên frontend chính (README.md:27, README.md:213, README.md:219, README.md:220).
- **Nhu cầu:** Đăng ký/đăng nhập mượt, thông tin mở cửa chính xác, thanh toán an toàn, cập nhật giao hàng realtime và hỗ trợ phản hồi nhanh.
- **Vấn đề giải quyết:** Giảm lo lắng về tiến trình chuẩn bị/giao, không phải nhập lại thông tin nhiều lần, có kênh escalations qua feedback.

#### Quản trị Nhà hàng
- **Mô tả:** Chủ/quản lý nhà hàng điều hành onboarding, menu, trạng thái kinh doanh và đơn tới qua portal riêng (README.md:28, README.md:186, README.md:187, README.md:188, README.md:189, README.md:190, README.md:191, README.md:192, README.md:195, README.md:196, README.md:197, README.md:198, README.md:199, README.md:200, README.md:201).
- **Nhu cầu:** Đăng ký/xác minh nhanh, CRUD menu kèm hình ảnh, bật/tắt hoạt động, nhận feed đơn realtime, xem phản hồi khách.
- **Vấn đề giải quyết:** Thay thế quy trình email thủ công, đồng bộ menu thực tế với app và đảm bảo nhân viên thấy trạng thái giống khách.

#### Quản trị viên (Super Admin & Ops)
- **Mô tả:** Bộ phận vận hành giám sát sức khỏe marketplace, tuân thủ nhà hàng, xét duyệt tài xế và truy cập dữ liệu qua dashboard/proxy tập trung (README.md:30, README.md:203, README.md:204, README.md:205, README.md:206, README.md:207, README.md:208, README.md:209, README.md:210, README.md:211, README.md:239, README.md:240, README.md:241).
- **Nhu cầu:** Tầm nhìn đa tenant, luồng phê duyệt, khả năng vô hiệu đối tượng xấu, audit trail và số liệu tổng hợp.
- **Vấn đề giải quyết:** Bỏ thao tác rời rạc giữa các dịch vụ, chuẩn hóa quản trị và rút ngắn thời gian xử lý sự cố.

### 2.5 Yêu cầu chức năng
| ID | Requirement | Priority | Notes / Acceptance Criteria |
|----|-------------|----------|-----------------------------|
| FR-01 | Cung cấp đăng ký, đăng nhập và quản lý hồ sơ an toàn cho Khách, Nhà hàng, Tài xế và Super Admin | Must | Tách luồng xác thực theo vai trò với endpoint hồ sơ bảo vệ bằng JWT (README.md:4, README.md:178, README.md:179, README.md:180, README.md:181, README.md:224, README.md:225, README.md:226, README.md:203, README.md:204). |
| FR-02 | Hỗ trợ onboarding nhà hàng, cập nhật hồ sơ và bật/tắt mở cửa | Must | Bao gồm đăng ký/đăng nhập, CRUD hồ sơ, API trạng thái và endpoint công khai (README.md:186, README.md:187, README.md:188, README.md:189, README.md:190, README.md:191, README.md:192). |
| FR-03 | Quản lý menu cùng tài nguyên media và trạng thái món | Must | Tài khoản nhà hàng (JWT) tạo/sửa/đổi trạng thái/xóa món, đồng thời xuất bản danh sách công khai (README.md:195, README.md:196, README.md:197, README.md:198, README.md:199, README.md:200, README.md:201). |
| FR-04 | Vận hành vòng đời đơn hàng end-to-end cho mọi vai trò | Must | Khách tạo đơn, các bên lấy dữ liệu, cập nhật trạng thái, hủy và gửi phản hồi (README.md:213, README.md:214, README.md:215, README.md:216, README.md:217, README.md:218, README.md:219, README.md:220). |
| FR-05 | Quản lý phân công giao, theo dõi và điều tiết hoạt động tài xế | Must | Tài xế truy cập CRUD/statistics; admin điều chỉnh trạng thái và hoạt động tài xế (README.md:229, README.md:230, README.md:231, README.md:232, README.md:233, README.md:234, README.md:235, README.md:236, README.md:239, README.md:240, README.md:241). |
| FR-06 | Xử lý thanh toán và đối soát trạng thái qua Stripe | Must | Payment Service tạo giao dịch, cung cấp webhook và đồng bộ kết quả với đơn (README.md:141, README.md:142, README.md:143, README.md:243, README.md:244, README.md:245). |
| FR-07 | Phát sự kiện realtime và thông báo nội bộ | Should | Realtime Gateway nhận sự kiện có khóa dịch vụ và phát qua Socket.IO/Redis (README.md:38, README.md:252, README.md:253, README.md:254, README.md:255, README.md:256, README.md:257, README.md:258, README.md:259). |
| FR-08 | Cung cấp góc nhìn quản trị tập trung về nhà hàng, khách, tài xế, đơn | Must | Super Admin đọc, phê duyệt, từ chối, xóa và proxy dữ liệu đa dịch vụ (README.md:203, README.md:204, README.md:205, README.md:206, README.md:207, README.md:208, README.md:209, README.md:210, README.md:211). |

### 2.6 Yêu cầu phi chức năng
| Category | Requirement | Target / Measure | Notes / Rationale |
|----------|-------------|------------------|-------------------|
| Performance & Scalability | Microservices phải chịu ít nhất 500 yêu cầu đồng thời với p95 <500 ms cho các luồng chính (auth, orders, delivery). | Kiểm thử tải: 500 user đồng thời; tự mở rộng ngang bằng replicaset. | Dịch vụ Node.js/Express độc lập cổng nên scale riêng; Docker Compose hỗ trợ nhân bản (README.md:33, README.md:34, README.md:35, README.md:36, README.md:37, README.md:52, README.md:168). |
| Availability & Resilience | Dịch vụ cốt lõi đạt uptime 99.5%/tháng, không mất dữ liệu khi 1 pod lỗi. | Triển khai dự phòng; lưu trữ trên cụm MongoDB quản lý. | Dịch vụ stateless kết hợp Mongo/Redis trung tâm giúp giảm phức tạp failover (README.md:45, README.md:46, README.md:47, README.md:168, README.md:171). |
| Security & Privacy | Áp dụng kiểm soát dựa trên JWT, khóa nội bộ giữa dịch vụ và token hóa tuân thủ PCI. | 100% endpoint bảo vệ yêu cầu JWT/hệ số nội bộ hợp lệ; không lưu thẻ thô. | `.env` bắt buộc JWT secret, service key, khóa Stripe; giao dịch xử lý qua Stripe (README.md:98, README.md:99, README.md:112, README.md:141, README.md:142, README.md:143, README.md:258, README.md:259). |
| Observability & Quality | Cung cấp test/lint tự động cho từng dịch vụ và logging tập trung phục vụ audit. | CI phải chạy unit test + lint; log lưu tối thiểu 30 ngày. | Repo ghi rõ lệnh test cho backend/frontend (README.md:288, README.md:289, README.md:291, README.md:292). |
| Usability & Accessibility | Frontend phải tải trong ≤3s trên kết nối băng thông rộng và đáp ứng tốt web/mobile. | Lighthouse ≥85 điểm, đáp ứng WCAG 2.1 AA về tương phản/form. | React frontend phục vụ khách và tài xế với định tuyến thân thiện (README.md:39, README.md:265, README.md:266, README.md:268, README.md:269, README.md:291, README.md:292). |
| Integration & Extensibility | Tích hợp ngoài (Twilio, Resend, geocoding) phải cấu hình được và thay thế không cần sửa code. | Thay đổi nhà cung cấp qua env/feature flag trong <30 phút. | Các khóa cấu hình trong `.env` giúp giảm phụ thuộc (README.md:51, README.md:62, README.md:144, README.md:145, README.md:146, README.md:147). |
