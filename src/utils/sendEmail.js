import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const sendMail = async ({ to, bcc, subject, html }) => {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const user = (process.env.EMAIL || '').trim();
  const pass = (process.env.EMAIL_PASSWORD || '').trim();

  // Determine BCC recipient if provided or fallback to admin EMAIL
  const bccRecipient = bcc || user;

  // 1. Prioritize Resend HTTPS API (Bypasses Render SMTP port 25/465/587 blocking 100%)
  if (resendApiKey) {
    try {
      const resend = new Resend(resendApiKey);
      const emailOptions = {
        from: 'MIRA Football <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      };
      if (bccRecipient && bccRecipient !== to) {
        emailOptions.bcc = [bccRecipient];
      }
      const data = await resend.emails.send(emailOptions);
      console.log('✅ Email sent via Resend HTTPS API to:', to, 'BCC:', bccRecipient, data);
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
    const mailOptions = {
      from: `"MIRA Football" <${user}>`,
      to,
      subject,
      html,
    };
    if (bccRecipient && bccRecipient !== to) {
      mailOptions.bcc = bccRecipient;
    }
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent via SMTP to:', to, 'BCC:', bccRecipient, info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending email via SMTP to:', to, error.message || error);
    throw error;
  }
};

export default sendMail;
