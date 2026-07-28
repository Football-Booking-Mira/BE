import nodemailer from "nodemailer";

const sendMail = async ({ to, subject, html }) => {
  const user = (process.env.EMAIL || "").trim();
  const pass = (process.env.EMAIL_PASSWORD || "").trim();

  if (!user || !pass) {
    console.warn("⚠️ SMTP Credentials missing (EMAIL / EMAIL_PASSWORD). Email will not be sent.");
    return null;
  }

  // Use Port 587 STARTTLS for cloud hosts (Render / AWS) to avoid Port 465 SSL blocking
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false, // Avoid TLS handshake rejection on cloud datacenters
    },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    const mailOptions = {
      from: `"MIRA Football" <${user}>`,
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully to:", to, "MessageID:", info.messageId);
    return info;
  } catch (error) {
    console.error("❌ Error sending email to:", to, "Reason:", error.message || error);
    throw error;
  }
};

export default sendMail;
