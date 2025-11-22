import nodemailer from "nodemailer";
import { EMAIL, EMAIL_PASSWORD } from "../common/config/environment.js";

// Validate email config
if (!EMAIL || !EMAIL_PASSWORD) {
  console.warn("[EMAIL] Warning: EMAIL or EMAIL_PASSWORD is not configured in .env");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  secure: true,
  host: "smtp.gmail.com",
  port: 465,
  auth: {
    user: EMAIL,
    pass: EMAIL_PASSWORD,
  },
});

// Verify transporter configuration
transporter.verify(function (error, success) {
  if (error) {
    console.error("[EMAIL] Transporter verification failed:", error);
  } else {
    console.log("[EMAIL] Transporter is ready to send emails");
  }
});

const sendMail = async ({ to, subject, html }) => {
  try {
    if (!EMAIL || !EMAIL_PASSWORD) {
      throw new Error("Email configuration is missing. Please check EMAIL and EMAIL_PASSWORD in .env");
    }

    if (!to) {
      throw new Error("Recipient email address is required");
    }

    const mailOptions = {
      from: `"Support Team" <${EMAIL}>`,
      to,
      subject,
      html,
    };

    console.log(`[EMAIL] Attempting to send email to: ${to}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Email sent successfully. MessageId: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("[EMAIL] Error sending email:", error.message);
    console.error("[EMAIL] Full error:", error);
    throw error;
  }
};

export default sendMail;
