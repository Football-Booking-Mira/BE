import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const sendMail = async ({ to, bcc, subject, html }) => {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const user = (process.env.EMAIL || 'trinhquochungwork@gmail.com').trim();
  const pass = (process.env.EMAIL_PASSWORD || '').trim();

  // 1. Prioritize Resend HTTPS API (Bypasses Render SMTP port 25/465/587 blocking 100%)
  if (resendApiKey) {
    try {
      const resend = new Resend(resendApiKey);

      // In Resend free tier (onboarding@resend.dev), Resend ONLY permits sending to the account owner (trinhquochungwork@gmail.com).
      // Sending to external/unverified emails returns 403 error.
      // Therefore, we direct the delivery to `user` (trinhquochungwork@gmail.com) with clear target header info.
      const isOwner = to === user;
      const targetTo = isOwner ? to : user;
      const displaySubject = isOwner ? subject : `[Gửi tới: ${to}] ${subject}`;
      const headerNotice = isOwner
        ? ''
        : `<div style="padding: 10px 14px; background: #eff6ff; border-left: 4px solid #3b82f6; margin-bottom: 16px; border-radius: 6px; font-family: sans-serif; font-size: 13px; color: #1e40af;">
            <b>📌 Thông báo thử nghiệm (Resend Test Mode):</b><br/>
            Email này gốc được gửi tới địa chỉ: <code style="background:#dbeafe; padding:2px 6px; border-radius:4px; font-weight:bold;">${to}</code>
           </div>`;

      const emailOptions = {
        from: 'MIRA Football <onboarding@resend.dev>',
        to: [targetTo],
        subject: displaySubject,
        html: `${headerNotice}${html}`,
      };

      const data = await resend.emails.send(emailOptions);
      console.log('✅ Email delivered via Resend HTTPS API to:', targetTo, '(Original target:', to, ')', data);
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
    if (user && user !== to) {
      mailOptions.bcc = user;
    }
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent via SMTP to:', to, info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending email via SMTP to:', to, error.message || error);
    throw error;
  }
};

export default sendMail;
