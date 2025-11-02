# YÊU CẦU KỸ THUẬT: XỬ LÝ DÒNG TIỀN (FINANCIAL FLOW)

## I. Cấu Trúc Backend và Kế Toán (Ledger System)

**Mục tiêu:** Xây dựng hệ thống sổ cái kép và Ví ảo để quản lý công nợ.

### 1.1. Cấu trúc Ví ảo (Virtual Wallets)
- **Yêu cầu:** Thiết lập 4 Ví ảo (Virtual Wallets) trong CSDL để quản lý dòng tiền và công nợ.
- **Chi tiết Ví:**
    - `Main_Holding_Wallet`: Nơi tập trung toàn bộ tiền Online đã nhận từ Khách hàng.
    - `Restaurant_Liability_Wallet`: Theo dõi số tiền Nền tảng giữ hộ Nhà hàng (chờ đối soát).
    - `Driver_Liability_Wallet`: Theo dõi số tiền Nền tảng giữ hộ Tài xế (phí ship ròng).
    - `Platform_Revenue_Wallet`: Nơi tổng hợp các khoản thu nhập của Nền tảng (Hoa hồng, Phí Duy trì).

### 1.2. Hệ thống Ghi sổ kép (Double-Entry Ledger)
- **Yêu cầu:** Mọi giao dịch tiền tệ phải được ghi nhận trong bảng `Financial_Ledger` theo nguyên tắc Debit/Credit.
- **Trường bắt buộc:** `Transaction_ID`, `Order_ID`, `Amount`, `Debit_Wallet_ID`, `Credit_Wallet_ID`, `Transaction_Type` (Commission, Refund, Subscription_Fee, Payout), và `Fund_Source` (Online/COD).

## II. Logic Tính Toán Thuế (VAT) và Hoa hồng

**Mục tiêu:** Tính toán các khoản phí một cách chính xác trước khi phân phối.

### 2.1. Tính toán VAT (Thuế GTGT)
- **Quy trình:** VAT (ví dụ: 10%) được tính trên Giá trị Món ăn (chưa VAT).
- **Ghi nhận:** Khoản VAT thu được từ Khách hàng phải được tách riêng và ghi nhận là **Công nợ Thuế** của Nhà hàng, không gộp vào giá trị tính Hoa hồng.

### 2.2. Tính toán Hoa hồng Nhà hàng
- **Cơ sở:** Hoa hồng phải được tính trên **Giá trị Món ăn CHƯA VAT**.
- **Xử lý:** Hoa hồng được trừ ngay khi đơn hàng chuyển sang trạng thái *Hoàn Thành* và chuyển vào `Platform_Revenue_Wallet`.

## III. Cơ chế Bù trừ Công nợ (Offsetting)

**Mục tiêu:** Tự động trừ phí Duy trì vào nguồn tiền Online của Nhà hàng.

### 3.1. Bù trừ Phí Duy trì (Duy nhất cho Online)
- **Yêu cầu:** Phí Duy trì định kỳ của Nhà hàng phải được **ưu tiên trừ tự động (Debit)** vào số dư tại `Restaurant_Liability_Wallet`.
- **Ghi sổ:** Chuyển khoản phí này từ `Restaurant_Liability_Wallet` sang `Platform_Revenue_Wallet`.

### 3.2. Ghi nhận Nợ COD
- **Yêu cầu:** Khi đơn COD *Hoàn Thành*, hệ thống phải ghi nhận Nhà hàng **nợ Nền tảng** tổng số tiền bằng **(Hoa hồng Món ăn + Phí Duy trì chưa bù trừ được)**. Khoản nợ này thể hiện qua số dư **âm** trong `Restaurant_Liability_Wallet`.

### 3.3. Phân phối Ròng (Net Payout)
- **Điều kiện:** Lệnh Payout chỉ được thực hiện khi số dư `Restaurant_Liability_Wallet` **dương**. Nếu âm, Admin yêu cầu thu nợ.

## IV. Yêu Cầu Giao Diện Hiển thị (Minh bạch)

**Mục tiêu:** Hiển thị rõ ràng các khoản trừ phí và thuế cho từng bên.

### 4.1. Giao diện Nhà hàng (Restaurant Panel)
- **Số dư:** Hiển thị rõ ràng `Current_Balance` của Ví Công nợ Nhà hàng, kèm theo trạng thái **Dương** (Nền tảng nợ) hoặc **Âm** (Nhà hàng nợ).
- **Sao kê:** Bảng sao kê phải tách biệt:
    1. Giá trị Món ăn Gộp (Gross).
    2. **(-) Hoa hồng Nền tảng.**
    3. **(-) Thuế VAT** (Ghi nhận công nợ thuế).
    4. **(-) Phí Duy trì** (Ghi rõ đã bù trừ hay chưa).

### 4.2. Giao diện Khách hàng (Customer App - Hóa đơn)
- **Tách biệt Thuế:** Hóa đơn phải hiển thị chi tiết các mục: **Giá Món (chưa VAT)**, **VAT**, **Phí Giao hàng**, **Phí Dịch vụ**.

### 4.3. Giao diện Tài xế (Driver App)
- **Thu nhập Ròng:** Hiển thị rõ ràng: **Phí Ship Gộp** và **(-) Phí Dịch vụ Tài xế** để tính ra **Thu nhập Ship Ròng**.

### 4.4. Giao diện Admin (Admin Panel)
- **Quản lý Nợ:** Cần có màn hình hiển thị danh sách tất cả các đối tác có số dư **âm** (công nợ nợ Nền tảng).
- **Kiểm toán Ledger:** Chức năng tìm kiếm và xem chi tiết giao dịch trong bảng Ledger (sổ cái) theo `Order_ID` và `Transaction_Type` để kiểm tra sự cân bằng của dòng tiền.