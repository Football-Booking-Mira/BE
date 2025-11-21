import crypto from "crypto";

export const formatVnpDate = (date = new Date()) => {
  const pad = (n) => n.toString().padStart(2, "0");
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = pad(local.getUTCMonth() + 1);
  const day = pad(local.getUTCDate());
  const hours = pad(local.getUTCHours());
  const minutes = pad(local.getUTCMinutes());
  const seconds = pad(local.getUTCSeconds());
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
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

