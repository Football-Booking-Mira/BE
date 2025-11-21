import crypto from "crypto";

/**
 * Format date theo chuẩn VNPay: yyyyMMddHHmmss (GMT+7 - giờ Việt Nam)
 * Format phải chính xác: yyyyMMddHHmmss (không có dấu - hoặc :)
 * @param {Date} date - Date object (mặc định là Date.now())
 * @returns {string} Format: yyyyMMddHHmmss
 */
export const formatVnpDate = (date = new Date()) => {
  const pad = (n) => n.toString().padStart(2, "0");
  
  // Lấy giờ Việt Nam (GMT+7) - chuyển từ UTC sang GMT+7
  const utcTime = date.getTime();
  const vnOffset = 7 * 60 * 60 * 1000; // GMT+7 = +7 giờ
  const vnTime = new Date(utcTime + vnOffset);
  
  // Lấy các thành phần thời gian từ UTC time (sau khi đã cộng offset)
  const year = vnTime.getUTCFullYear();
  const month = pad(vnTime.getUTCMonth() + 1);
  const day = pad(vnTime.getUTCDate());
  const hours = pad(vnTime.getUTCHours());
  const minutes = pad(vnTime.getUTCMinutes());
  const seconds = pad(vnTime.getUTCSeconds());
  
  // Format: yyyyMMddHHmmss (không có dấu - hoặc :, không có space)
  const formatted = `${year}${month}${day}${hours}${minutes}${seconds}`;
  
  // Validate format (phải có đúng 14 ký tự số)
  if (!/^\d{14}$/.test(formatted)) {
    throw new Error(`Invalid VNPay date format: ${formatted}. Expected yyyyMMddHHmmss`);
  }
  
  return formatted;
};

export const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "127.0.0.1"
  );
};

export const sortObject = (obj) => {
  const sorted = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      sorted[key] = obj[key];
    });
  return sorted;
};

export const createSecureHash = (data, secret) => {
  return crypto.createHmac("sha512", secret).update(Buffer.from(data, "utf-8")).digest("hex");
};

