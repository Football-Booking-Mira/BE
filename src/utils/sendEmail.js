import nodemailer from "nodemailer";
import { EMAIL, EMAIL_PASSWORD } from "../common/config/environment.js";

const cleanEmail = (EMAIL || "").trim();
const cleanPassword = (EMAIL_PASSWORD || "").trim();

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: cleanEmail,
    pass: cleanPassword,
  },
  connectionTimeout: 8000, // 8 seconds max connection timeout
  greetingTimeout: 5000,
  socketTimeout: 10000,
});

const sendMail = async ({ to, subject, html }) => {
  if (!cleanEmail || !cleanPassword) {
    console.warn("⚠️ SMTP Credentials missing (EMAIL / EMAIL_PASSWORD). Email will not be sent.");
    return null;
  }

  try {
    const mailOptions = {
      from: `"MIRA Football Support" <${cleanEmail}>`,
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully to:", to, info.messageId);
    return info;
  } catch (error) {
    console.error("❌ Error sending email to:", to, error.message || error);
    throw error;
  }
};

export default sendMail;
