# cấu hình test vn pay
- npm init -y
- npm install express mongoose dotenv body-parser cookie-parser uuid crypto qs

# cấu hình vào env
# === VNPAY CONFIG (Sandbox) ===
- VNP_TMN_CODE=6SSYOR4R
- VNP_HASH_SECRET=L0J74TAKXVRWW07FP180L8Y92NXDIFF7
- VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
- VNP_RETURN_URL=http://localhost:5173/payment-return

# thông tin test thẻ
- https://sandbox.vnpayment.vn/apis/vnpay-demo/

