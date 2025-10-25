export function renderEmailTemplate(params) {
  const year = params.year || new Date().getFullYear();

  if (params.type === "forgot") {
    return `
    <!doctype html>
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <title>Đặt lại mật khẩu</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style="margin:0;padding:0;background:#f5f7fb;">
        <table role="presentation" width="100%" style="background:#f5f7fb;">
          <tr><td align="center" style="padding:24px;">
            <table role="presentation" style="max-width:600px;width:100%;">
              <tr>
                <td align="center">
                  <a href="${params.homepageUrl}">
                    <img src="${params.logoUrl}" width="120" style="display:block;margin:0 auto;border:0;">
                  </a>
                </td>
              </tr>
              <tr>
                <td style="background:#fff;border-radius:12px;padding:28px 24px;color:#111827;border:1px solid #e5e7eb;">
                  <h1 style="font-size:20px;margin:0 0 12px;">Đặt lại mật khẩu</h1>
                  <p style="font-size:14px;color:#4b5563;">
                    Xin chào ${params.userName}, chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản
                    <strong>${params.email}</strong> tại <strong>${params.productName}</strong>.
                  </p>
                  <p style="font-size:14px;color:#4b5563;">
                    Nếu đó là bạn, vui lòng bấm nút bên dưới để tạo mật khẩu mới. Liên kết sẽ hết hạn sau
                    <strong>${params.tokenTTLMinutes} phút</strong>.
                  </p>
                  <a href="${params.resetUrl}"
                     style="display:inline-block;margin:12px 0;padding:12px 18px;background:#2563eb;color:#fff;
                     border-radius:8px;font-weight:600;text-decoration:none;">
                    ĐẶT LẠI MẬT KHẨU
                  </a>
                  <p style="font-size:12px;color:#6b7280;">
                    Nếu nút không hoạt động, copy đường dẫn này và dán vào trình duyệt:<br>
                    <span style="word-break:break-all;color:#374151;">${params.resetUrl}</span>
                  </p>
                  <p style="font-size:12px;color:#9ca3af;">
                    Nếu bạn không yêu cầu, có thể bỏ qua email này. Tài khoản của bạn vẫn an toàn.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="text-align:center;padding:16px 8px;color:#9ca3af;font-size:12px;">
                  © ${year} ${params.companyName} · <a href="${params.supportUrl}" style="color:#6b7280;">Hỗ trợ</a>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>
    `;
  }

  if (params.type === "verify-email") {
    return `
    <!doctype html>
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <title>Xác thực email</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style="margin:0;padding:0;background:#f5f7fb;">
        <table role="presentation" width="100%" style="background:#f5f7fb;">
          <tr><td align="center" style="padding:24px;">
            <table role="presentation" style="max-width:600px;width:100%;">
              <tr>
                <td align="center">
                  <a href="${params.homepageUrl}">
                    <img src="${params.logoUrl}" width="120" style="display:block;margin:0 auto;border:0;">
                  </a>
                </td>
              </tr>
              <tr>
                <td style="background:#fff;border-radius:12px;padding:28px 24px;color:#111827;border:1px solid #e5e7eb;">
                  <h1 style="font-size:20px;margin:0 0 12px;">✉️ Xác thực email của bạn</h1>
                  <p style="font-size:14px;color:#4b5563;">
                    Xin chào ${params.userName},
                  </p>
                  <p style="font-size:14px;color:#4b5563;">
                    Cảm ơn bạn đã đăng ký tài khoản tại <strong>${params.productName}</strong>!
                    Để hoàn tất quá trình đăng ký, vui lòng xác thực email
                    <strong>${params.email}</strong> bằng cách bấm nút bên dưới.
                  </p>
                  <p style="font-size:14px;color:#4b5563;">
                    Liên kết xác thực sẽ hết hạn sau <strong>${params.tokenTTLMinutes} phút</strong>.
                  </p>
                  <a href="${params.verifyUrl}"
                     style="display:inline-block;margin:16px 0;padding:14px 28px;background:#10b981;color:#fff;
                     border-radius:8px;font-weight:600;text-decoration:none;font-size:16px;">
                    XÁC THỰC EMAIL
                  </a>
                  <p style="font-size:12px;color:#6b7280;">
                    Nếu nút không hoạt động, copy đường dẫn này và dán vào trình duyệt:<br>
                    <span style="word-break:break-all;color:#374151;">${params.verifyUrl}</span>
                  </p>
                  <div style="background:#f3f4f6;border-left:4px solid #10b981;padding:12px;border-radius:4px;margin-top:16px;">
                    <p style="font-size:12px;color:#6b7280;margin:0;">
                      <strong>💡 Mẹo bảo mật:</strong> Nếu bạn không tạo tài khoản này, vui lòng bỏ qua email này hoặc
                      <a href="${params.supportUrl}" style="color:#10b981;">liên hệ đội hỗ trợ</a>.
                    </p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="text-align:center;padding:16px 8px;color:#9ca3af;font-size:12px;">
                  © ${year} ${params.companyName} · <a href="${params.supportUrl}" style="color:#6b7280;">Hỗ trợ</a>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>
    `;
  }

  return `
  <!doctype html>
  <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Đổi mật khẩu thành công</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body style="margin:0;padding:0;background:#f5f7fb;">
      <table role="presentation" width="100%" style="background:#f5f7fb;">
        <tr><td align="center" style="padding:24px;">
          <table role="presentation" style="max-width:600px;width:100%;">
            <tr>
              <td align="center">
                <a href="${params.homepageUrl}">
                  <img src="${params.logoUrl}" width="120" style="display:block;margin:0 auto;border:0;">
                </a>
              </td>
            </tr>
            <tr>
              <td style="background:#fff;border-radius:12px;padding:28px 24px;color:#111827;border:1px solid #e5e7eb;">
                <h1 style="font-size:20px;margin:0 0 12px;">Đổi mật khẩu thành công</h1>
                <p style="font-size:14px;color:#4b5563;">
                  Xin chào ${params.userName}, mật khẩu cho tài khoản <strong>${params.email}</strong>
                  tại <strong>${params.productName}</strong> đã được cập nhật lúc
                  <strong>${params.changedAt}</strong> từ IP <strong>${params.ip}</strong>.
                </p>
                <p style="font-size:14px;color:#4b5563;">
                  Nếu không phải bạn, vui lòng
                  <a href="${params.resetAgainUrl}" style="color:#2563eb;">đặt lại mật khẩu</a>
                  và liên hệ <a href="${params.securityHelpUrl}" style="color:#2563eb;">đội hỗ trợ</a>.
                </p>
                <p style="font-size:13px;color:#6b7280;">
                  Thiết bị: ${params.userAgent}<br>
                  Vị trí ước lượng: ${params.approxLocation}
                </p>
                <p style="font-size:12px;color:#9ca3af;margin-top:12px;">
                  Mẹo: bật xác thực hai bước (2FA) để bảo vệ tài khoản tốt hơn.
                </p>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;padding:16px 8px;color:#9ca3af;font-size:12px;">
                © ${year} ${params.companyName} · <a href="${params.securityHelpUrl}" style="color:#6b7280;">Trung tâm bảo mật</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
  </html>
  `;
}

const base = (type, email, name, link) =>
  renderEmailTemplate({
    type,
    productName: "FPOLY",
    companyName: "FPT Polytechnic",
    email,
    userName: name,
    logoUrl: "https://logo.png",
    resetUrl: link,
    verifyUrl: link,
    tokenTTLMinutes: 15,
  });

export const htmlForgot = (email, name, link) =>
  base("forgot", email, name, link);

export const htmlVerify = (email, name, link) =>
  base("verify-email", email, name, link);

export const htmlReset = (email, name) => base("reset-success", email, name);
