import nodemailer from "nodemailer";
import { EMAIL, EMAIL_PASSWORD } from "../common/config/environment.js";

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

const sendMail = async ({ to, subject, html }) => {
  try {
    const mailOptions = {
      from: `"Support Team" <${EMAIL || "no-reply@example.com"}>`,
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

export default sendMail;
