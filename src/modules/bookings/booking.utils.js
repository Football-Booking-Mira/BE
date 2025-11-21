import { USER_ROLES } from "../../common/constants/enums.js";
import { CANCEL_BEFORE_HOURS, HOURS_IN_MS } from "./booking.constants.js";

export function generateBookingCode() {
  const random = Math.floor(10000000 + Math.random() * 90000000);
  return `DS${random}`;
}

export function buildDateWithTime(date, time) {
  if (!date) return null;
  const result = new Date(date);
  if (Number.isNaN(result.getTime()) || typeof time !== "string") return null;
  const [hh, mm] = time.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  result.setHours(hh, mm, 0, 0);
  return result;
}

export function hoursUntilStart(booking) {
  const startDate = buildDateWithTime(booking.date, booking.startTime);
  if (!startDate) return null;
  return (startDate.getTime() - Date.now()) / HOURS_IN_MS;
}

export function canCancelWithinWindow(booking, isAdmin) {
  if (isAdmin) return true;
  if (booking.status !== "pending") return false;
  const hoursDiff = hoursUntilStart(booking);
  if (hoursDiff === null) return false;
  return hoursDiff >= CANCEL_BEFORE_HOURS;
}

export function isAdminUser(user) {
  return user?.role === USER_ROLES.ADMIN;
}

export function isBookingOwner(booking, user) {
  if (!user?._id) return false;
  const customerId = booking.customerId?._id ?? booking.customerId;
  if (!customerId) return false;
  return String(customerId) === String(user._id);
}

export function ensureAdmin(req, res) {
  if (!req.user) {
    res.status(401).json({ message: "Bạn cần đăng nhập với quyền admin" });
    return false;
  }
  if (!isAdminUser(req.user)) {
    res.status(403).json({ message: "Chức năng chỉ dành cho admin" });
    return false;
  }
  return true;
}

