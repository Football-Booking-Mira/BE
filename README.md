#  MIRA Football - Backend API
> Hệ thống API quản lý đặt sân bóng đá trực tuyến.

---

##  Tài khoản Demo (Demo Credentials)

Bạn có thể sử dụng các tài khoản demo dưới đây để thử nghiệm hệ thống:

| Vai trò (Role) | Email | Mật khẩu (Password) | Ghi chú (Note) |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin@gmail.com` | `admin123` | Quản lý sân bóng, đặt sân, doanh thu... |
| **Khách hàng (User)** | `user@gmail.com` | `admin123` | Tìm kiếm sân, đặt lịch, thanh toán... |

---

##  Yêu cầu

- **Node.js** >= 18
- **npm** >= 9
- **Git**
## Cách chạy dự án

### 1. Clone & cài đặt
```bash
git clone https://github.com/Football-Booking-Mira/BE.git
cd BE
npm install
```

### 2. Tạo file `.env`

Tạo file `.env` tại thư mục gốc `BE/` với nội dung:

```env
HOST=localhost
PORT=3000

# MongoDB
DB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/bookingfootball?retryWrites=true&w=majority

# Cloudinary (Upload ảnh)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# JWT
JWT_ACCESS_SECRECT=your_jwt_secret_key
JWT_ACCESS_EXPIRED=30d

# Frontend URL (CORS)
FRONT_END_URL=http://localhost:5173

# Email (Gmail App Password)
EMAIL=your_email@gmail.com
EMAIL_PASSWORD=your_gmail_app_password

# VNPay
VNP_TMN_CODE=your_vnpay_tmn_code
VNP_HASH_SECRET=your_vnpay_hash_secret
VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNP_RETURN_URL=http://localhost:3000/api/payment/vnpay/return

# ZaloPay
ZALOPAY_CALLBACK_URL=http://localhost:3000/api/payment/zalopay/callback

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key
```

>  **Lưu ý:**
> - `EMAIL_PASSWORD` phải là **App Password** của Google → tạo tại [Google App Passwords](https://myaccount.google.com/apppasswords).
> - VNPay dùng môi trường **Sandbox** → xem thẻ test tại [Sandbox VNPay](https://sandbox.vnpayment.vn/apis/vnpay-demo/).
> - Lấy `GEMINI_API_KEY` tại [Google AI Studio](https://aistudio.google.com/apikey).

### 3. Chạy server

```bash
# Development (có hot-reload)
npm run dev

# Production
npm start
```

### 4. Kiểm tra

- Server chạy tại: **http://localhost:3000**
- Health check: truy cập `http://localhost:3000/ping` → trả về `pong` là thành công
- Swagger API docs: **http://localhost:3000/api-docs**
