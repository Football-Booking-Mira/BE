import nodemailer from "nodemailer";

// Cấu hình Gmail SMTP trực tiếp
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "thanhdajt2410@gmail.com", // tự điền email
    pass: "pdyk dudv sgiq hzji", // tự điền mật khẩu ứng dụng Gmail
  },
});

export const sendPaymentSuccessEmail = async (req, res) => {
  try {
    const {
      email,
      customerName = "Ksss",
      bookingCode,
      courtName,
      date,
      startTime,
      endTime,
      total,
    } = req.body;

    if (
      !email ||
      !bookingCode ||
      !courtName ||
      !date ||
      !startTime ||
      !endTime ||
      !total
    ) {
      return res
        .status(400)
        .json({ message: "Thiếu thông tin bắt buộc để gửi email." });
    }

    const totalNumber = Number(total) || 0;

    const mailOptions = {
      from: `"Booking App" <thanhdajt2410@gmail.com>`,
      to: email,
      subject: `✅ Thanh toán thành công - Đơn hàng ${bookingCode}`,
      html: `
      <div style="font-family: Arial, sans-serif; background-color:#f5f5f5; padding:20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:auto; background:white; border-collapse:collapse;">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#10b981; padding:25px; text-align:center; color:white;">
              <h2 style="margin:0; font-size:24px;">Xác nhận thanh toán thành công</h2>
              <p style="margin:5px 0 0; font-size:14px;">Mã đơn hàng: <strong>${bookingCode}</strong></p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:20px; color:#333; font-size:15px;">
              <p>Xin chào <strong>${customerName}</strong>,</p>
              <p>Cảm ơn bạn đã sử dụng dịch vụ đặt sân của <strong>Booking App</strong>. Dưới đây là thông tin chi tiết đơn đặt sân của bạn:</p>
            </td>
          </tr>

          <!-- Order Info -->
          <tr>
            <td style="padding:0 20px 20px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr style="background:#f8fafc;">
                  <td style="padding:12px; font-weight:bold;">Sân bóng</td>
                  <td style="padding:12px; text-align:right;">${courtName}</td>
                </tr>
                <tr style="background:white;">
                  <td style="padding:12px; font-weight:bold;">Ngày đặt</td>
                  <td style="padding:12px; text-align:right;">${date}</td>
                </tr>
                <tr style="background:#f8fafc;">
                  <td style="padding:12px; font-weight:bold;">Khung giờ</td>
                  <td style="padding:12px; text-align:right;">${startTime} - ${endTime}</td>
                </tr>
                <tr style="background:white;">
                  <td style="padding:12px; font-weight:bold;">Tổng tiền</td>
                  <td style="padding:12px; text-align:right; font-weight:bold; color:#10b981;">
                    ${totalNumber.toLocaleString("vi-VN")} VNĐ
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:20px; text-align:center;">
              <a href="http://localhost:5173/my-bookings" 
                 style="background:#10b981; color:white; text-decoration:none; padding:12px 24px; border-radius:6px; font-weight:bold; display:inline-block;">
                Xem chi tiết đơn hàng
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:15px; text-align:center; font-size:12px; color:#777;">
              © ${new Date().getFullYear()} Booking App — All rights reserved.
            </td>
          </tr>

        </table>
      </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email đã gửi thành công tới: ${email}`);
    res.status(200).json({ message: "Gửi email thành công" });
  } catch (error) {
    console.error("❌ Error sending email:", error);
    res
      .status(500)
      .json({ message: "Gửi email thất bại", error: error.message });
  }
};
