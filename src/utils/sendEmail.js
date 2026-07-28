import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const sendMail = async ({ to, subject, html }) => {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const user = (process.env.EMAIL || '').trim();
  const pass = (process.env.EMAIL_PASSWORD || '').trim();

  // 1. Prioritize Resend HTTPS API (Bypasses Render SMTP port 25/465/587 blocking 100%)
  if (resendApiKey) {
    try {
      const resend = new Resend(resendApiKey);
      const data = await resend.emails.send({
        from: 'MIRA Football <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      });
      console.log('✅ Email sent via Resend HTTPS API to:', to, data);
      return data;
    } catch (resendErr) {
      console.error('❌ Resend API Error:', resendErr?.message || resendErr);
    }
  }

  // 2. Fallback to Nodemailer SMTP (works in local dev environments)
  if (!user || !pass) {
    console.warn('⚠️ No email credentials found (RESEND_API_KEY or EMAIL/EMAIL_PASSWORD missing).');
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
  });

  try {
    const info = await transporter.sendMail({
      from: `"MIRA Football" <${user}>`,
      to,
      subject,
      html,
    });
    console.log('✅ Email sent via SMTP to:', to, info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending email via SMTP to:', to, error.message || error);
    throw error;
  }
};

export default sendMail;
