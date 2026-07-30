import mongoose from 'mongoose';
import {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  USER_ROLES,
  DEPOSIT_STATUS,
} from '../../common/constants/enums.js';
import Order from '../orders/order.models.js';
import createError from '../../utils/error.js';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import BookingItem from '../bookingItems/bookingItem.models.js';
import { Court } from '../courts/court.models.js';
import Equipment from '../equipments/equipment.models.js';
import Booking from './booking.models.js';
import InvoiceModel from '../invoices/invoice.models.js';

import {
  commitVoucherUsage,
  restoreVoucherUsage,
  validateVoucherForOrder,
} from '../vouchers/voucher.service.js';

const toMinutes = (t) => {
  const [h, m] = String(t || '0:0')
    .split(':')
    .map(Number);
  return h * 60 + m;
};
const distributeDiscountByAmount = (amounts = [], totalDiscount = 0) => {
  const nums = amounts.map((v) => Math.max(0, Number(v || 0)));
  const total = nums.reduce((s, v) => s + v, 0);

  const discountTotal = Math.min(Math.max(0, Number(totalDiscount || 0)), total);
  if (total <= 0 || discountTotal <= 0) return nums.map(() => 0);

  // Largest Remainder Method
  const rows = nums.map((amt, i) => {
    const raw = (discountTotal * amt) / total;
    const flo = Math.min(amt, Math.floor(raw));
    return { i, amt, raw, flo, rem: raw - flo };
  });

  let sumFlo = rows.reduce((s, r) => s + r.flo, 0);
  let leftover = discountTotal - sumFlo;

  rows.sort((a, b) => b.rem - a.rem);

  // phân nốt phần lẻ
  for (const r of rows) {
    if (leftover <= 0) break;
    const cap = r.amt - r.flo;
    if (cap <= 0) continue;

    const add = Math.min(cap, leftover);
    r.flo += add;
    leftover -= add;
  }

  // nếu vẫn còn (hiếm, do cap), rải tuần tự
  if (leftover > 0) {
    for (const r of rows) {
      if (leftover <= 0) break;
      const cap = r.amt - r.flo;
      if (cap <= 0) continue;

      const add = Math.min(cap, leftover);
      r.flo += add;
      leftover -= add;
    }
  }

  const out = Array(nums.length).fill(0);
  for (const r of rows) out[r.i] = r.flo;

  return out;
};

const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

const getStockFieldName = (eq) =>
  typeof eq.availableQuantity === 'number'
    ? 'availableQuantity'
    : typeof eq.stockLeft === 'number'
      ? 'stockLeft'
      : typeof eq.stock === 'number'
        ? 'stock'
        : 'totalQuantity';

const normalizeTime = (t) =>
  String(t || '')
    .trim()
    .padStart(5, '0'); // "6:00" -> "06:00"
const canonicalSlotKey = (start, end) => `${normalizeTime(start)}-${normalizeTime(end)}`;
const slotKey = (s, e) => canonicalSlotKey(s, e);

const normalizeEquipmentBySlotMap = (equipmentBySlot = {}) => {
  const out = {};
  if (!equipmentBySlot || typeof equipmentBySlot !== 'object') return out;

  for (const [rawKey, rawArr] of Object.entries(equipmentBySlot)) {
    const keyStr = String(rawKey || '');

    // bắt các dạng: "14:45-15:45" hoặc "14:45 - 15:45"
    const m = keyStr.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    const k = m ? canonicalSlotKey(m[1], m[2]) : keyStr.replace(/\s+/g, '');

    const arr = Array.isArray(rawArr) ? rawArr : [];
    if (!out[k]) out[k] = [];
    out[k].push(...arr);
  }
  return out;
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const pickEquipmentId = (it) => {
  if (!it) return null;

  if (typeof it.equipmentId === 'string') return it.equipmentId;

  if (it.equipmentId && typeof it.equipmentId === 'object') {
    return it.equipmentId._id || it.equipmentId.id || null;
  }

  return it._id || it.id || null;
};

const mergeItems = (items = []) => {
  const map = new Map(); // key = equipmentId|mode

  for (const raw of items) {
    const equipmentId = pickEquipmentId(raw);
    if (!equipmentId) continue;

    const qty = toNum(raw.qty);
    if (qty <= 0) continue;

    const mode = raw.mode === 'sell' ? 'sell' : 'rent';
    const price = toNum(raw.price);

    const key = `${String(equipmentId)}|${mode}`;
    const prev = map.get(key) || { equipmentId, mode, qty: 0, price: 0 };

    prev.qty += qty;
    if (price > 0) prev.price = price;

    map.set(key, prev);
  }

  return Array.from(map.values());
};

const collectEquipmentItemsForSlots = (slotsInBooking = [], equipmentBySlot = {}) => {
  const normalizedMap = normalizeEquipmentBySlotMap(equipmentBySlot);

  const collected = [];
  for (const s of slotsInBooking) {
    const k = slotKey(s.startTime, s.endTime); // canonical
    const arr = Array.isArray(normalizedMap[k]) ? normalizedMap[k] : [];
    collected.push(...arr);
  }
  return mergeItems(collected);
};

// Xác định 1 booking có thực sự "giữ sân" hay không
const isBlockingBooking = (b) => {
  if (b.status === BOOKING_STATUS.CANCELLED) return false;

  // booking tạm trong createMultiBooking -> luôn block
  if (!b.paymentMethod && !b.createdBy && b.slots) return true;

  const depositPaid = (b.depositAmount || 0) > 0 && b.depositStatus === DEPOSIT_STATUS.PAID;
  const hasPaid =
    b.paymentStatus === PAYMENT_STATUS.PAID ||
    b.paymentStatus === PAYMENT_STATUS.REFUNDED ||
    depositPaid;

  // ADMIN / CASH luôn block
  if (b.createdBy === USER_ROLES.ADMIN || b.paymentMethod === PAYMENT_METHOD.CASH) return true;

  // ONLINE: PENDING + UNPAID nhưng còn trong 5 phút vẫn giữ chỗ
  if ([PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(b.paymentMethod)) {
    const stillHolding =
      b.status === BOOKING_STATUS.PENDING &&
      b.paymentStatus === PAYMENT_STATUS.UNPAID &&
      b.autoCancelAt &&
      new Date(b.autoCancelAt).getTime() > Date.now();

    if (stillHolding) return true;

    // hết hạn thì không block nữa (job sẽ hủy)
    return !!hasPaid;
  }

  return !!hasPaid;
};

// Chuyển 1 danh sách slot thành list khoảng thời gian (đơn vị: phút)
const buildIntervalsFromSlots = (slots = [], fallbackStart, fallbackEnd) => {
  if (Array.isArray(slots) && slots.length > 0) {
    return slots.map((s) => ({
      start: toMinutes(s.startTime),
      end: toMinutes(s.endTime),
    }));
  }
  return [
    {
      start: toMinutes(fallbackStart),
      end: toMinutes(fallbackEnd),
    },
  ];
};

// Kiểm tra 1 list slot cần đặt có đụng bất kỳ booking nào không
const hasAnyOverlapWithBookings = (requestSlots, existingBookings, ignoreBookingId = null) => {
  const reqIntervals = buildIntervalsFromSlots(
    requestSlots,
    requestSlots[0]?.startTime,
    requestSlots[0]?.endTime
  );

  for (const b of existingBookings) {
    if (ignoreBookingId && String(b._id) === String(ignoreBookingId)) continue;
    if (!isBlockingBooking(b)) continue;

    const bookingIntervals = buildIntervalsFromSlots(b.slots, b.startTime, b.endTime);

    for (const r of reqIntervals) {
      for (const i of bookingIntervals) {
        if (overlap(r.start, r.end, i.start, i.end) > 0) {
          return true;
        }
      }
    }
  }

  return false;
};

//* Cấu hình ca giờ
const START_HOUR = 6; // 06:00
const END_HOUR = 22; // 22:00
const SLOT_DURATION = 60; // 1 ca = 60 phút
const BREAK_DURATION = 15; // nghỉ 15p giữa các ca
const PEAK_START_HOUR = 16; // từ 16h trở đi là cao điểm

const minToTime = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

//* Tạo danh sách ca: 06:00-07:00, 07:15-08:15, ..., 21:00-22:00
const generateTimeSlots = () => {
  const slots = [];
  let current = START_HOUR * 60;
  const endDay = END_HOUR * 60;

  while (current + SLOT_DURATION <= endDay) {
    const start = minToTime(current);
    const end = minToTime(current + SLOT_DURATION);
    slots.push({ start, end });
    current += SLOT_DURATION + BREAK_DURATION;
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

// Gom slots thành các nhóm LIỀN NHAU.
const groupSlotsByContinuous = (slots = []) => {
  if (!Array.isArray(slots) || slots.length === 0) return [];

  const sorted = [...slots].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

  const groups = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const gap = toMinutes(cur.startTime) - toMinutes(prev.endTime);

    if (gap <= BREAK_DURATION) {
      current.push(cur);
    } else {
      groups.push(current);
      current = [cur];
    }
  }
  groups.push(current);
  return groups;
};

const calcPaidAmountFromDeposit = (b) =>
  b.depositStatus === DEPOSIT_STATUS.PAID ? Number(b.depositAmount || 0) : 0;

const recalcPaymentStatusByDeposit = (b) => {
  if (b.paymentStatus === PAYMENT_STATUS.REFUNDED) return;

  const total = Number(b.total || 0);
  const paid = calcPaidAmountFromDeposit(b);

  if (paid >= total && total > 0) b.paymentStatus = PAYMENT_STATUS.PAID;
  else if (paid > 0) b.paymentStatus = PAYMENT_STATUS.PARTIAL;
  else b.paymentStatus = PAYMENT_STATUS.UNPAID;
};

/*
 * Tính tiền sân theo SỐ CA (không tính 15 phút nghỉ)
 */
const calcFieldPriceBySlots = (startTime, endTime, court) => {
  const startMinRaw = toMinutes(startTime);
  const endMinRaw = toMinutes(endTime);

  if (Number.isNaN(startMinRaw) || Number.isNaN(endMinRaw) || endMinRaw <= startMinRaw) {
    return {
      slotCount: 0,
      fieldAmount: 0,
      normalHours: 0,
      peakHours: 0,
      totalHours: 0,
      breakMinutes: 0,
    };
  }

  const openStart = START_HOUR * 60;
  const openEnd = END_HOUR * 60;

  const realStart = Math.max(startMinRaw, openStart);
  const realEnd = Math.min(endMinRaw, openEnd);
  if (realEnd <= realStart) {
    return {
      slotCount: 0,
      fieldAmount: 0,
      normalHours: 0,
      peakHours: 0,
      totalHours: 0,
      breakMinutes: 0,
    };
  }

  let slotCount = 0;
  let fieldAmount = 0;
  let normalHours = 0;
  let peakHours = 0;

  TIME_SLOTS.forEach((slot) => {
    const s = toMinutes(slot.start);
    const e = toMinutes(slot.end);

    if (s >= realStart && e <= realEnd) {
      slotCount += 1;

      const isPeak = Math.floor(s / 60) >= PEAK_START_HOUR;
      if (isPeak) {
        fieldAmount += court.peakPrice;
        peakHours += 1;
      } else {
        fieldAmount += court.basePrice;
        normalHours += 1;
      }
    }
  });

  const totalHours = slotCount;
  const breakMinutes = slotCount > 1 ? (slotCount - 1) * BREAK_DURATION : 0;

  return {
    slotCount,
    fieldAmount,
    normalHours,
    peakHours,
    totalHours,
    breakMinutes,
  };
};

/*
 * Tính tiền sân từ danh sách các ca FE gửi lên (slots[])
 */
const calcFieldPriceFromSlotsList = (rawSlots = [], court) => {
  if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
    return { slotCount: 0, fieldAmount: 0, totalHours: 0, normalHours: 0, peakHours: 0 };
  }

  let fieldAmount = 0;
  let totalHours = 0;
  let slotCount = 0;
  let normalHours = 0;
  let peakHours = 0;

  for (const s of rawSlots) {
    if (!s || !s.startTime || !s.endTime) {
      throw createError(400, 'Slot không hợp lệ (thiếu startTime / endTime)!');
    }

    const {
      slotCount: c,
      fieldAmount: fa,
      totalHours: th,
      normalHours: nh,
      peakHours: ph,
    } = calcFieldPriceBySlots(s.startTime, s.endTime, court);

    if (c !== 1) {
      throw createError(
        400,
        `Khung giờ ${s.startTime} - ${s.endTime} không hợp lệ hoặc không phải 1 ca 60 phút!`
      );
    }

    fieldAmount += fa;
    totalHours += th;
    slotCount += c;
    normalHours += nh;
    peakHours += ph;
  }

  return { slotCount, fieldAmount, totalHours, normalHours, peakHours };
};

//* Tính tiền theo ca (support GET query và POST body)
export const calculateBookingPrice = handleAsync(async (req, res, next) => {
  const courtId = req.body.courtId || req.query.courtId;
  const slots = req.body.slots;

  const startTime = req.body.startTime || req.query.startTime;
  const endTime = req.body.endTime || req.query.endTime;

  if (!courtId) {
    return next(createError(400, 'Thiếu dữ liệu để tính tiền!'));
  }

  const court = await Court.findById(courtId);
  if (!court) return next(createError(404, 'Không tìm thấy sân!'));

  if (Array.isArray(slots) && slots.length > 0) {
    const { slotCount, fieldAmount, totalHours, normalHours, peakHours } =
      calcFieldPriceFromSlotsList(slots, court);

    if (slotCount === 0) {
      return next(createError(400, 'Danh sách ca không hợp lệ!'));
    }

    return res.status(200).json(
      createResponse(true, 200, 'Tính tiền thành công!', {
        fieldAmount,
        equipmentTotal: 0,
        discountTotal: 0,
        total: fieldAmount,
        normalHours,
        peakHours,
        totalHours,
      })
    );
  }

  if (!startTime || !endTime) {
    return next(createError(400, 'Thiếu dữ liệu để tính tiền!'));
  }

  const { slotCount, fieldAmount, normalHours, peakHours, totalHours } = calcFieldPriceBySlots(
    startTime,
    endTime,
    court
  );

  if (slotCount === 0) {
    return next(
      createError(400, 'Khung giờ không hợp lệ hoặc nằm ngoài giờ hoạt động (06:00–22:00)!')
    );
  }

  return res.status(200).json(
    createResponse(true, 200, 'Tính tiền thành công!', {
      fieldAmount,
      equipmentTotal: 0,
      discountTotal: 0,
      total: fieldAmount,
      normalHours,
      peakHours,
      totalHours,
    })
  );
});

/**
 * TẠO BOOKING (có hỗ trợ nhiều block slot + order gộp cho online)
 */
export const createBooking = handleAsync(async (req, res, next) => {
  const {
    courtId,
    customerId,
    date,
    startTime,
    endTime,
    paymentMethod,
    note,
    isOffline,
    customerInfo,
    paidAtCreation,
    voucherCode,
    slots,
    totalFieldAmount,
    equipmentBySlot,
  } = req.body;

  const hasSlotList = Array.isArray(slots) && slots.length > 0;

  if (!courtId || !date || (!startTime && !hasSlotList) || (!endTime && !hasSlotList)) {
    return next(createError(400, 'Thiếu dữ liệu bắt buộc!'));
  }

  const court = await Court.findById(courtId);
  if (!court) return next(createError(404, 'Không tìm thấy sân!'));

  const roleFromToken = (req.user?.role || USER_ROLES.USER).toLowerCase();

  // Admin chỉ được tạo booking qua trang admin (isOffline = true)
  if (roleFromToken === USER_ROLES.ADMIN && isOffline !== true && isOffline !== 'true') {
    return next(
      createError(
        403,
        'Tài khoản quản trị không thể đặt sân ở trang khách hàng. Vui lòng sử dụng trang quản trị để tạo đơn đặt sân!'
      )
    );
  }

  const isOfflineMode =
    isOffline === true || isOffline === 'true' || roleFromToken === USER_ROLES.ADMIN;

  const isOnlineMode =
    !isOfflineMode &&
    [PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO, PAYMENT_METHOD.ZALOPAY].includes(paymentMethod);

  const createdBy = isOfflineMode ? USER_ROLES.ADMIN : roleFromToken;

  const finalCustomerId =
    createdBy === USER_ROLES.ADMIN ? customerId || null : req.user?._id || customerId || null;

  const normalizedCustomerInfo = {
    name: customerInfo?.name?.trim() || '',
    phone: customerInfo?.phone?.trim() || '',
    email: customerInfo?.email?.trim() || '',
  };

  let slotGroups = [];
  let cleanedSlots = []; //  khai báo ngoài để dùng về sau

  if (hasSlotList) {
    cleanedSlots = slots.filter((s) => s && s.startTime && s.endTime);
    if (cleanedSlots.length === 0) {
      return next(createError(400, 'Danh sách ca không hợp lệ!'));
    }
    // Không gộp các ca liên tục nữa, mỗi ca là một booking riêng lẻ để hỗ trợ hủy từng ca
    slotGroups = cleanedSlots.map((s) => [s]);
  } else {
    if (!startTime || !endTime) {
      return next(createError(400, 'Thiếu giờ bắt đầu / kết thúc!'));
    }
    slotGroups = [[{ startTime, endTime }]];
  }

  if (!Array.isArray(slotGroups) || slotGroups.length === 0) {
    return next(createError(400, 'Không tìm thấy khung giờ hợp lệ để đặt sân!'));
  }

  const groupSummaries = [];

  for (const group of slotGroups) {
    const gStart = group[0].startTime;
    const gEnd = group[group.length - 1].endTime;

    let calcResult;
    if (hasSlotList) {
      calcResult = calcFieldPriceFromSlotsList(group, court);
    } else {
      calcResult = calcFieldPriceBySlots(gStart, gEnd, court);
    }

    const { slotCount, fieldAmount, totalHours } = calcResult;

    if (slotCount === 0) {
      return next(
        createError(400, `Khung giờ ${gStart} - ${gEnd} không hợp lệ hoặc nằm ngoài giờ hoạt động!`)
      );
    }

    groupSummaries.push({
      startTime: gStart,
      endTime: gEnd,
      slotCount,
      fieldAmount,
      totalHours,
      slots: hasSlotList ? group : undefined,
    });
  }

  if (typeof totalFieldAmount !== 'undefined') {
    const clientFieldAmount = Number(totalFieldAmount);
    const serverFieldAmount = groupSummaries.reduce(
      (sum, g) => sum + Number(g.fieldAmount || 0),
      0
    );
    if (
      typeof clientFieldAmount === 'number' &&
      clientFieldAmount > 0 &&
      Math.abs(clientFieldAmount - serverFieldAmount) >= 1000
    ) {
      console.warn(
        '[createBooking] totalFieldAmount FE:',
        clientFieldAmount,
        ' != server:',
        serverFieldAmount
      );
    }
  }

  const bookingDateObj = new Date(date);
  if (Number.isNaN(bookingDateObj.getTime())) {
    return next(createError(400, 'Ngày đặt không hợp lệ!'));
  }

  const bookingDay = new Date(
    bookingDateObj.getFullYear(),
    bookingDateObj.getMonth(),
    bookingDateObj.getDate()
  );
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const firstStartTime = groupSummaries[0].startTime;
  const [sh, sm] = firstStartTime.split(':').map(Number);
  const bookingStartDateTime = new Date(
    bookingDateObj.getFullYear(),
    bookingDateObj.getMonth(),
    bookingDateObj.getDate(),
    sh,
    sm || 0,
    0,
    0
  );

  const isFutureMatch =
    bookingDay.getTime() > today.getTime() ||
    (bookingDay.getTime() === today.getTime() && bookingStartDateTime.getTime() > now.getTime());

  const day = new Date(bookingDay);
  day.setHours(0, 0, 0, 0);
  const nextDay = new Date(day);
  nextDay.setDate(day.getDate() + 1);

  const bookingsSameDay = await Booking.find({
    courtId,
    date: { $gte: day, $lt: nextDay },
    status: { $ne: BOOKING_STATUS.CANCELLED },
  });

  const requestSlots =
    hasSlotList && cleanedSlots.length > 0
      ? cleanedSlots
      : [{ startTime: groupSummaries[0].startTime, endTime: groupSummaries[0].endTime }];

  if (hasAnyOverlapWithBookings(requestSlots, bookingsSameDay)) {
    return next(createError(400, 'Khung giờ này đã có người đặt!'));
  }

  let voucherPayload = null;
  if (voucherCode) {
    if (!finalCustomerId) {
      return next(createError(400, 'Vui lòng chọn khách hàng để áp dụng voucher!'));
    }

    const totalFieldAllGroups = groupSummaries.reduce(
      (sum, g) => sum + Number(g.fieldAmount || 0),
      0
    );

    // nếu FE gửi slots[] thì dùng toàn bộ slots (không chỉ group 0)
    const allSlots = hasSlotList ? cleanedSlots : undefined;

    voucherPayload = await validateVoucherForOrder({
      code: voucherCode,
      userId: finalCustomerId,

      //  voucher tính theo tổng tiền sân của cả đơn
      orderTotal: totalFieldAllGroups,

      courtId,
      courtType: court.type,
      bookingDate: date,

      // dùng ca đầu làm mốc giờ (nếu service cần)
      startTime: groupSummaries[0].startTime,

      //  gửi toàn bộ slots để service check điều kiện (nếu có)
      slots: allSlots,
    });
  }

  const voucherDiscountTotal = voucherPayload?.discountAmount || 0;
  //  chia theo tỉ lệ tiền sân của từng group
  const discountByGroup = voucherPayload
    ? distributeDiscountByAmount(
        groupSummaries.map((g) => g.fieldAmount),
        voucherDiscountTotal
      )
    : groupSummaries.map(() => 0);

  const initialStatus = isOfflineMode ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING;

  let autoCancelAt = null;
  if (
    !isOfflineMode &&
    [PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO, PAYMENT_METHOD.ZALOPAY].includes(paymentMethod)
  ) {
    const expireMinutes = 5;
    autoCancelAt = new Date(Date.now() + expireMinutes * 60 * 1000);
  }

  const createdBookings = [];

  for (let index = 0; index < groupSummaries.length; index++) {
    const summary = groupSummaries[index];
    const isVoucherBooking = index === 0 && !!voucherPayload;

    let initialPaymentStatus = PAYMENT_STATUS.UNPAID;
    let depositAmount = 0;
    let depositStatus = DEPOSIT_STATUS.PENDING;
    let depositMethod = undefined;

    if (isOfflineMode && paymentMethod === PAYMENT_METHOD.CASH) {
      if (isFutureMatch) {
        const paidFlag = paidAtCreation === true || paidAtCreation === 'true';

        if (!paidFlag) {
          return next(
            createError(
              400,
              'Khách đặt sân đá sau (khác ngày hoặc khác giờ) bắt buộc phải cọc tối thiểu 50% tiền sân!'
            )
          );
        }

        depositAmount = Math.round(summary.fieldAmount * 0.5);
        depositStatus = DEPOSIT_STATUS.PAID;
        depositMethod = PAYMENT_METHOD.CASH;

        initialPaymentStatus = PAYMENT_STATUS.PARTIAL;
      } else {
        const paidFlag = paidAtCreation === true || paidAtCreation === 'true';

        if (paidFlag) {
          initialPaymentStatus = PAYMENT_STATUS.PAID;
        } else {
          initialPaymentStatus = PAYMENT_STATUS.UNPAID;
        }
      }
    } else {
      initialPaymentStatus = PAYMENT_STATUS.UNPAID;
    }

    //  mỗi booking nhận 1 phần discount
    const discountForThisBooking = Number(discountByGroup[index] || 0);
    const totalForThisBooking = Math.max(0, summary.fieldAmount - discountForThisBooking);

    const booking = await Booking.create({
      code:
        groupSummaries.length === 1
          ? `BK${Date.now().toString().slice(-6)}`
          : `BK${Date.now().toString().slice(-6)}${String(index + 1).padStart(2, '0')}`,
      courtId,
      customerId: finalCustomerId,
      customerInfo: normalizedCustomerInfo,
      date,
      startTime: summary.startTime,
      endTime: summary.endTime,
      hours: summary.totalHours,
      fieldAmount: summary.fieldAmount,
      equipmentTotal: 0,
      discountTotal: discountForThisBooking,
      total: totalForThisBooking,
      paymentMethod,
      notes: note || '',
      status: initialStatus,
      slots: summary.slots,
      paymentStatus: initialPaymentStatus,
      createdBy,
      autoCancelAt,
      depositAmount,
      depositStatus,
      depositMethod,
      voucherId: isVoucherBooking ? voucherPayload?.voucher?._id || null : null,
      voucherCode: isVoucherBooking ? voucherPayload?.normalizedCode || '' : '',
      voucherDiscount: isVoucherBooking ? voucherDiscountTotal : 0, //  tổng discount để commit usage 1 lần
      voucherUsageStatus: isVoucherBooking && voucherPayload ? 'pending' : 'none',
      voucherSnapshot:
        isVoucherBooking && voucherPayload
          ? {
              discountType: voucherPayload.voucher.discountType,
              discountValue: voucherPayload.voucher.discountValue,
              maxDiscountValue: voucherPayload.voucher.maxDiscountValue,
              minOrderValue: voucherPayload.voucher.minOrderValue,
              perUserLimit: voucherPayload.voucher.perUserLimit,
              startDate: voucherPayload.voucher.startDate,
              endDate: voucherPayload.voucher.endDate,
            }
          : undefined,
      voucherUsageStatus: isVoucherBooking && voucherPayload ? 'pending' : 'none',
    });

    //  RESERVE + TÍNH TIỀN THIẾT BỊ NGAY KHI TẠO BOOKING
    let eqMap = equipmentBySlot;

    // FE  gửi string JSON
    if (typeof eqMap === 'string') {
      try {
        eqMap = JSON.parse(eqMap);
      } catch {
        eqMap = null;
      }
    }

    eqMap = eqMap && typeof eqMap === 'object' ? eqMap : null;

    if (eqMap) {
      const slotsInThisBooking =
        Array.isArray(summary.slots) && summary.slots.length > 0
          ? summary.slots
          : [{ startTime: summary.startTime, endTime: summary.endTime }];

      const merged = collectEquipmentItemsForSlots(slotsInThisBooking, eqMap);

      let equipmentTotalCalc = 0;
      const changedStocks = [];

      try {
        for (const it of merged) {
          const { equipmentId, mode, qty, price } = it;

          const eq = await Equipment.findById(equipmentId);
          if (!eq) throw createError(404, 'Thiết bị không tồn tại');

          const stockFieldName = getStockFieldName(eq);
          const currentStock = Number(eq[stockFieldName] || 0);

          if (currentStock < qty) {
            throw createError(
              400,
              `Thiết bị ${eq.name} không đủ số lượng (còn ${currentStock}, yêu cầu ${qty})`
            );
          }

          const unitPrice =
            typeof price === 'number' && price > 0
              ? price
              : mode === 'sell'
                ? Number(eq.salePrice || 0)
                : Number(eq.rentPrice || 0);

          const lineSubtotal = unitPrice * qty;
          equipmentTotalCalc += lineSubtotal;

          // trừ kho (reserve)
          eq[stockFieldName] = currentStock - qty;
          await eq.save();
          changedStocks.push({ equipmentId: eq._id, stockFieldName, qty });

          await BookingItem.create({
            bookingId: booking._id,
            equipmentId,
            mode,
            qty,
            price: unitPrice,
            subtotal: lineSubtotal,
            name: eq.name,
            unit: eq.unit || 'cái',
          });
        }

        // update tổng
        if (equipmentTotalCalc > 0) {
          booking.equipmentTotal = equipmentTotalCalc;
          booking.total =
            (booking.fieldAmount || 0) + equipmentTotalCalc - (booking.discountTotal || 0);
          await booking.save();
        }
      } catch (err) {
        // rollback kho + xóa bookingitems + xóa booking
        await BookingItem.deleteMany({ bookingId: booking._id }).catch(() => {});
        for (const c of changedStocks) {
          const eq = await Equipment.findById(c.equipmentId).catch(() => null);
          if (!eq) continue;
          eq[c.stockFieldName] = Number(eq[c.stockFieldName] || 0) + Number(c.qty || 0);
          await eq.save().catch(() => {});
        }
        await Booking.findByIdAndDelete(booking._id).catch(() => {});
        throw err;
      }
    }

    // commit voucher nếu đã PAID ngay lúc tạo (CASH tại quầy / admin)
    if (isVoucherBooking && initialPaymentStatus === PAYMENT_STATUS.PAID) {
      try {
        const usage = await commitVoucherUsage({
          voucherId: voucherPayload.voucher._id,
          bookingId: booking._id,
          userId: finalCustomerId,
          discountAmount: voucherDiscountTotal,
          orderTotal: totalFieldAllGroups,
        });
        booking.voucherUsageId = usage._id;
        booking.voucherUsageStatus = 'applied';
        await booking.save();
      } catch (error) {
        // nếu fail commit voucher => rollback luôn kho + bookingItems đã reserve (nếu có)
        const items = await BookingItem.find({ bookingId: booking._id })
          .lean()
          .catch(() => []);
        for (const it of items) {
          const eq = await Equipment.findById(it.equipmentId).catch(() => null);
          if (!eq) continue;
          const stockFieldName = getStockFieldName(eq);
          eq[stockFieldName] = Number(eq[stockFieldName] || 0) + Number(it.qty || 0);
          await eq.save().catch(() => {});
        }
        await BookingItem.deleteMany({ bookingId: booking._id }).catch(() => {});
        await Booking.findByIdAndDelete(booking._id).catch(() => {});
        return next(error);
      }
    }

    createdBookings.push(booking);
  }

  // TẠO ORDER GỘP CHO NHIỀU BOOKING (để UI gộp chung một nhóm)
  if (createdBookings.length > 1) {
    const totalOrderAmount = createdBookings.reduce((sum, b) => sum + Number(b.total || 0), 0);

    const order = await Order.create({
      code: `OD${Date.now().toString().slice(-6)}`,
      customerId: finalCustomerId,
      bookings: createdBookings.map((b) => b._id),
      total: totalOrderAmount,
      paymentStatus: PAYMENT_STATUS.UNPAID,
      paymentMethod,
      status: 'PENDING',
    });

    await Booking.updateMany(
      { _id: { $in: createdBookings.map((b) => b._id) } },
      { $set: { orderId: order._id } }
    );

    createdBookings.forEach((b) => {
      b.orderId = order._id;
    });
  }

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  io?.to(String(courtId)).emit('booking_updated', {
    courtId: String(courtId),
    date: new Date(date).toISOString().slice(0, 10),
  });

  if (createdBookings.length === 1) {
    return res
      .status(201)
      .json(createResponse(true, 201, 'Tạo đơn đặt sân thành công!', createdBookings[0]));
  }

  return res
    .status(201)
    .json(createResponse(true, 201, 'Tạo nhiều đơn đặt sân thành công!', createdBookings));
});

//* Lấy slot theo sân
export const getBookingsByCourt = handleAsync(async (req, res, next) => {
  const { courtId } = req.params;
  const { startDate, endDate } = req.query;

  if (!courtId) {
    return next(createError(400, 'Thiếu courtId!'));
  }

  const filter = {
    courtId,
    status: { $ne: BOOKING_STATUS.CANCELLED },
  };

  if (startDate && endDate) {
    const from = new Date(startDate);
    from.setHours(0, 0, 0, 0);

    const to = new Date(endDate);
    to.setHours(23, 59, 59, 999);

    filter.date = { $gte: from, $lte: to };
  }

  const allBookings = await Booking.find(filter).select(
    'date startTime endTime status slots paymentStatus paymentMethod depositStatus depositAmount createdBy autoCancelAt'
  );

  const blockingBookings = allBookings.filter((b) => isBlockingBooking(b));

  return res.json(createResponse(true, 200, 'Danh sách giờ đã được đặt', blockingBookings));
});

//* Hủy booking
export const cancelBooking = handleAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

  const user = req.user;
  const { reason, internalNote } = req.body;
  const previousStatus = booking.status;

  if (user.role === USER_ROLES.USER) {
    if (String(booking.customerId) !== String(user._id)) {
      return next(createError(403, 'Bạn không có quyền hủy đơn này!'));
    }
    if (booking.status !== BOOKING_STATUS.PENDING) {
      return next(createError(400, 'Chỉ được hủy đơn đang chờ thanh toán/xác nhận!'));
    }

    if (!reason || !reason.trim()) {
      return next(createError(400, 'Vui lòng nhập lý do hủy đơn!'));
    }
  }

  if (
    user.role === USER_ROLES.ADMIN &&
    [BOOKING_STATUS.IN_USE, BOOKING_STATUS.COMPLETED].includes(booking.status)
  ) {
    return next(createError(400, 'Đơn đang sử dụng/đã hoàn tất, không thể hủy!'));
  }

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.updatedAt = new Date();
  booking.cancelledAt = new Date();
  await booking.save();

  booking.cancelBy = user.role;

  if (reason && reason.trim()) {
    booking.cancelReason = reason.trim();
  }

  if (user.role === USER_ROLES.ADMIN && internalNote && internalNote.trim()) {
    booking.cancelNote = internalNote.trim();
  }

  const isAdmin = user.role === USER_ROLES.ADMIN;
  const isPaidOrPartial = [PAYMENT_STATUS.PAID, PAYMENT_STATUS.PARTIAL].includes(
    booking.paymentStatus
  );
  const isOnlinePayment = [PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(
    booking.paymentMethod
  );

  if (
    isAdmin &&
    isPaidOrPartial &&
    isOnlinePayment &&
    (!booking.refundStatus || booking.refundStatus === 'none')
  ) {
    booking.refundStatus = 'processing';
    booking.refundAdminReason =
      (internalNote && internalNote.trim()) ||
      (reason && reason.trim()) ||
      'Admin hủy đơn online và đang xử lý hoàn tiền cho khách';
  }

  const remainingBookings = await Booking.countDocuments({
    orderId: booking.orderId,
    status: { $nin: [BOOKING_STATUS.CANCELLED] },
  });

  if (
    booking.voucherUsageId &&
    booking.voucherUsageStatus === 'applied' &&
    ![BOOKING_STATUS.IN_USE, BOOKING_STATUS.COMPLETED].includes(previousStatus) &&
    remainingBookings === 0 //  CHỈ BOOKING CUỐI CÙNG
  ) {
    await restoreVoucherUsage(booking);
    booking.voucherUsageStatus = 'restored';
    booking.voucherRestoredAt = new Date();
  } else if (booking.voucherUsageStatus === 'pending') {
    booking.voucherUsageStatus = 'none';
  }

  //  Khi hủy 1 phần đơn có voucher: xóa discountTotal trên TẤT CẢ booking trong order
  // Vì voucher mất hiệu lực khi hủy một phần (như cảnh báo FE đã thông báo)
  if (booking.orderId && remainingBookings > 0) {
    // Kiểm tra đơn có voucher không (bất kỳ booking nào trong order có discountTotal > 0)
    const siblingBookings = await Booking.find({
      orderId: booking.orderId,
      _id: { $ne: booking._id },
      status: { $ne: BOOKING_STATUS.CANCELLED },
    });

    const orderHasVoucher = siblingBookings.some(
      (b) => Number(b.discountTotal || 0) > 0 || b.voucherCode || b.voucherId
    ) || Number(booking.discountTotal || 0) > 0 || booking.voucherCode || booking.voucherId;

    if (orderHasVoucher) {
      // Xóa discount trên các ca còn lại (không bị hủy)
      for (const sibling of siblingBookings) {
        if (Number(sibling.discountTotal || 0) > 0) {
          sibling.discountTotal = 0;
          sibling.total = Math.max(0, Number(sibling.fieldAmount || 0) + Number(sibling.equipmentTotal || 0));
          sibling.voucherCode = '';
          sibling.voucherId = null;
          sibling.voucherDiscount = 0;
          await sibling.save();
        }
      }

      // Xóa discount trên chính booking bị hủy để refund amount đúng
      // Refund = fieldAmount gốc (không trừ voucher) vì voucher đã bị revoke
      if (Number(booking.discountTotal || 0) > 0) {
        booking.discountTotal = 0;
        booking.total = Math.max(0, Number(booking.fieldAmount || 0) + Number(booking.equipmentTotal || 0));
        booking.voucherCode = '';
        booking.voucherId = null;
        booking.voucherDiscount = 0;
      }
    }
  }

  if (isPaidOrPartial) {
    if (booking.orderId) {
      const allBookings = await Booking.find({ orderId: booking.orderId });
      const totalPaid = allBookings.reduce((sum, b) => sum + (b.depositAmount || 0), 0);
      const totalRefundedSoFar = allBookings.reduce((sum, b) => {
        if (b.status === BOOKING_STATUS.CANCELLED && String(b._id) !== String(booking._id)) {
          return sum + (b.refundAmount || 0);
        }
        return sum;
      }, 0);
      const activeBookings = allBookings.filter(
        (b) => b.status !== BOOKING_STATUS.CANCELLED && String(b._id) !== String(booking._id)
      );
      const totalCostOfActiveBookings = activeBookings.reduce((sum, b) => sum + (b.total || 0), 0);
      booking.refundAmount = Math.max(0, totalPaid - totalRefundedSoFar - totalCostOfActiveBookings);
    } else {
      booking.refundAmount = booking.depositAmount || booking.total || 0;
    }
  }

  await booking.save(); //  SAVE LẦN CUỐI

  // booking bị hủy khi chưa IN_USE/COMPLETED => trả lại kho thiết bị đã reserve
  if (![BOOKING_STATUS.IN_USE, BOOKING_STATUS.COMPLETED].includes(previousStatus)) {
    const items = await BookingItem.find({ bookingId: booking._id }).lean();
    for (const it of items) {
      const eq = await Equipment.findById(it.equipmentId);
      if (!eq) continue;

      const stockFieldName = getStockFieldName(eq);
      eq[stockFieldName] = Number(eq[stockFieldName] || 0) + Number(it.qty || 0);
      await eq.save();
    }
    await BookingItem.deleteMany({ bookingId: booking._id });
  }

  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  io?.to(String(booking.courtId)).emit('booking_updated', {
    courtId: String(booking.courtId),
    date: booking.date.toISOString().slice(0, 10),
  });

  return res.json(createResponse(true, 200, ' Hủy booking thành công!', booking));
});

/**
 * CREATE MULTI BOOKING
 *  dùng được song song với createBooking mới
 */
export const createMultiBooking = handleAsync(async (req, res, next) => {
  const {
    courtId,
    customerId,
    date,
    timeSlots,
    paymentMethod,
    note,
    isOffline,
    customerInfo,
    paidAtCreation,
    equipmentBySlot,
  } = req.body;

  if (!courtId || !date || !timeSlots || !Array.isArray(timeSlots) || timeSlots.length === 0) {
    return next(createError(400, 'Thiếu sân, ngày hoặc danh sách khung giờ!'));
  }

  const court = await Court.findById(courtId);
  if (!court) return next(createError(404, 'Không tìm thấy sân!'));

  const roleFromToken = (req.user?.role || USER_ROLES.USER).toLowerCase();
  const isOfflineMode =
    isOffline === true || isOffline === 'true' || roleFromToken === USER_ROLES.ADMIN;
  const createdBy = isOfflineMode ? USER_ROLES.ADMIN : roleFromToken;
  const finalCustomerId =
    createdBy === USER_ROLES.ADMIN ? customerId || null : req.user?._id || customerId || null;

  let initialPaymentStatus = PAYMENT_STATUS.UNPAID;
  if (isOfflineMode && paymentMethod === PAYMENT_METHOD.CASH && paidAtCreation === true) {
    initialPaymentStatus = PAYMENT_STATUS.PAID;
  }

  const createdBookings = [];

  const day = new Date(date);
  if (Number.isNaN(day.getTime())) return next(createError(400, 'Ngày đặt không hợp lệ!'));
  day.setHours(0, 0, 0, 0);
  const nextDay = new Date(day);
  nextDay.setDate(day.getDate() + 1);

  const bookingsSameDay = await Booking.find({
    courtId,
    date: { $gte: day, $lt: nextDay },
    status: { $ne: BOOKING_STATUS.CANCELLED },
  });

  for (const slot of timeSlots) {
    const { startTime, endTime } = slot || {};
    if (!startTime || !endTime) {
      return next(createError(400, 'Mỗi slot phải có startTime và endTime!'));
    }

    const { slotCount, fieldAmount, totalHours } = calcFieldPriceBySlots(startTime, endTime, court);

    if (slotCount === 0) {
      return next(
        createError(
          400,
          `Khung giờ ${startTime} - ${endTime} không hợp lệ hoặc nằm ngoài giờ hoạt động!`
        )
      );
    }

    const requestSlots = [{ startTime, endTime }];

    if (hasAnyOverlapWithBookings(requestSlots, bookingsSameDay)) {
      return next(
        createError(400, `Khung giờ ${startTime} - ${endTime} đã có người đặt trên sân này!`)
      );
    }

    bookingsSameDay.push({
      _id: 'temp_' + startTime + '_' + endTime,
      startTime,
      endTime,
      slots: [{ startTime, endTime }],
    });

    const initialStatus = isOfflineMode ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING;

    const booking = await Booking.create({
      code: `BK${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`,
      courtId,
      customerId: finalCustomerId,
      customerInfo: {
        name: customerInfo?.name?.trim() || '',
        phone: customerInfo?.phone?.trim() || '',
        email: customerInfo?.email?.trim() || '',
      },
      date,
      startTime,
      endTime,
      hours: totalHours,
      fieldAmount,
      equipmentTotal: 0,
      discountTotal: 0,
      total: fieldAmount,
      paymentMethod,
      notes: note || '',
      status: initialStatus,
      paymentStatus: initialPaymentStatus,
      createdBy,
    });

    // RESERVE + TÍNH TIỀN THIẾT BỊ NGAY KHI TẠO BOOKING
    const eqMap = equipmentBySlot && typeof equipmentBySlot === 'object' ? equipmentBySlot : null;

    if (eqMap) {
      const k = slotKey(startTime, endTime);
      const raw = Array.isArray(eqMap[k]) ? eqMap[k] : [];
      const merged = mergeItems(raw);

      let equipmentTotalCalc = 0;
      const changedStocks = [];

      try {
        for (const it of merged) {
          const { equipmentId, mode, qty, price } = it;

          const eq = await Equipment.findById(equipmentId);
          if (!eq) throw createError(404, 'Thiết bị không tồn tại');

          const stockFieldName = getStockFieldName(eq);
          const currentStock = Number(eq[stockFieldName] || 0);

          if (currentStock < qty) {
            throw createError(
              400,
              `Thiết bị ${eq.name} không đủ số lượng (còn ${currentStock}, yêu cầu ${qty})`
            );
          }

          const unitPrice =
            typeof price === 'number' && price > 0
              ? price
              : mode === 'sell'
                ? Number(eq.salePrice || 0)
                : Number(eq.rentPrice || 0);

          const lineSubtotal = unitPrice * qty;
          equipmentTotalCalc += lineSubtotal;

          // trừ kho (reserve)
          eq[stockFieldName] = currentStock - qty;
          await eq.save();
          changedStocks.push({ equipmentId: eq._id, stockFieldName, qty });

          await BookingItem.create({
            bookingId: booking._id,
            equipmentId,
            mode,
            qty,
            price: unitPrice,
            subtotal: lineSubtotal,
            name: eq.name,
            unit: eq.unit || 'cái',
          });
        }

        if (equipmentTotalCalc > 0) {
          booking.equipmentTotal = equipmentTotalCalc;
          booking.total =
            (booking.fieldAmount || 0) + equipmentTotalCalc - (booking.discountTotal || 0);
          await booking.save();
        }
      } catch (err) {
        // rollback kho + xóa bookingitems + xóa booking
        await BookingItem.deleteMany({ bookingId: booking._id }).catch(() => {});
        for (const c of changedStocks) {
          const eq = await Equipment.findById(c.equipmentId).catch(() => null);
          if (!eq) continue;
          eq[c.stockFieldName] = Number(eq[c.stockFieldName] || 0) + Number(c.qty || 0);
          await eq.save().catch(() => {});
        }
        await Booking.findByIdAndDelete(booking._id).catch(() => {});
        throw err;
      }
    }

    createdBookings.push(booking);

    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(courtId)).emit('booking_updated', {
      courtId: String(courtId),
      date: new Date(date).toISOString().slice(0, 10),
    });
  }

  return res
    .status(201)
    .json(createResponse(true, 201, 'Tạo booking thành công!', createdBookings));
});

// * ADMIN xác nhận
export const confirmBooking = handleAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

  if (booking.status !== BOOKING_STATUS.PENDING) {
    return next(createError(400, 'Chỉ xác nhận đơn đang chờ xác nhận!'));
  }

  booking.status = BOOKING_STATUS.CONFIRMED;
  booking.updatedAt = new Date();
  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  io?.to(String(booking.courtId)).emit('booking_updated', {
    courtId: String(booking.courtId),
    date: booking.date.toISOString().slice(0, 10),
  });

  return res.json(createResponse(true, 200, 'Xác nhận booking thành công!', booking));
});

// * CHECKIN
export const checkinBooking = handleAsync(async (req, res, next) => {
  const bookingId = req.params.id;
  const { items = [] } = req.body;

  const booking = await Booking.findById(bookingId);
  if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));

  if (booking.status !== BOOKING_STATUS.CONFIRMED) {
    return next(createError(400, 'Chỉ đơn đã xác nhận mới được check-in'));
  }

  //  RULE: chỉ check-in đúng ngày đá + từ giờ bắt đầu - 15p
  // const now = new Date();

  // // chuẩn hóa "ngày" theo timezone của server (thường VN ok)
  // const bDate = new Date(booking.date);
  // const bookingDayStart = new Date(
  //     bDate.getFullYear(),
  //     bDate.getMonth(),
  //     bDate.getDate(),
  //     0,
  //     0,
  //     0,
  //     0
  // );
  // const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // // chỉ đúng ngày đá
  // if (bookingDayStart.getTime() !== todayStart.getTime()) {
  //     return next(createError(400, 'Chỉ được check-in đúng ngày đặt sân!'));
  // }

  // // tính thời điểm bắt đầu trận theo startTime booking
  // const [sh, sm] = String(booking.startTime || '00:00')
  //     .split(':')
  //     .map(Number);
  // const startDateTime = new Date(
  //     bDate.getFullYear(),
  //     bDate.getMonth(),
  //     bDate.getDate(),
  //     Number.isFinite(sh) ? sh : 0,
  //     Number.isFinite(sm) ? sm : 0,
  //     0,
  //     0
  // );

  // const earliestCheckin = new Date(startDateTime.getTime() - 15 * 60 * 1000);

  // if (now.getTime() < earliestCheckin.getTime()) {
  //     // format HH:mm cho dễ hiểu
  //     const hh = String(earliestCheckin.getHours()).padStart(2, '0');
  //     const mm = String(earliestCheckin.getMinutes()).padStart(2, '0');
  //     return next(
  //         createError(400, `Chỉ được check-in từ ${hh}:${mm} (trước giờ bắt đầu 15 phút) trở đi!`)
  //     );
  // }

  const hasNewItems = Array.isArray(items) && items.length > 0;

  // Nếu có items => coi là THÊM MỚI (append), không restore + không delete
  if (hasNewItems) {
    for (const item of items) {
      const { equipmentId, mode, qty, price } = item;
      const realQty = Number(qty || 0);
      if (!equipmentId || realQty <= 0) continue;

      const eq = await Equipment.findById(equipmentId);
      if (!eq) return next(createError(404, `Thiết bị không tồn tại`));

      const stockFieldName = getStockFieldName(eq);
      const currentStock = Number(eq[stockFieldName] || 0);

      if (currentStock < realQty) {
        return next(
          createError(
            400,
            `Thiết bị ${eq.name} không đủ số lượng (còn ${currentStock}, yêu cầu ${realQty})`
          )
        );
      }

      const unitPrice =
        typeof price === 'number' && price > 0
          ? price
          : mode === 'sell'
            ? Number(eq.salePrice || 0)
            : Number(eq.rentPrice || 0);

      const lineSubtotal = unitPrice * realQty;

      // trừ kho
      eq[stockFieldName] = currentStock - realQty;
      if (mode === 'rent') eq.rentedQuantity = (eq.rentedQuantity || 0) + realQty;
      await eq.save();

      await BookingItem.create({
        bookingId,
        equipmentId,
        mode,
        qty: realQty,
        price: unitPrice,
        subtotal: lineSubtotal,
        name: eq.name,
        unit: eq.unit || 'gói',
      });
    }
  }

  // Recalc equipmentTotal từ DB để khỏi lệch
  const agg = await BookingItem.aggregate([
    { $match: { bookingId: booking._id } },
    { $group: { _id: '$bookingId', total: { $sum: '$subtotal' } } },
  ]);
  const equipmentTotal = Number(agg?.[0]?.total || 0);

  booking.status = BOOKING_STATUS.IN_USE;
  booking.equipmentTotal = equipmentTotal;
  booking.total = Math.max(
    0,
    Number(booking.fieldAmount || 0) + equipmentTotal - Number(booking.discountTotal || 0)
  );

  if (booking.voucherUsageStatus === 'applied') booking.voucherUsageStatus = 'consumed';

  // online thì paymentStatus phải dựa vào depositAmount, không được giữ PAID cũ
  if ([PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(booking.paymentMethod)) {
    recalcPaymentStatusByDeposit(booking);
  }

  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  io?.to(String(booking.courtId)).emit('booking_updated', {
    courtId: String(booking.courtId),
    date: booking.date.toISOString().slice(0, 10),
  });

  return res.json(createResponse(true, 200, 'Check-in thành công!', booking));
});

//* CHECKOUT
export const checkoutBooking = handleAsync(async (req, res, next) => {
  const bookingId = req.params.id;

  const booking = await Booking.findById(bookingId);
  if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));
  if (booking.status !== BOOKING_STATUS.IN_USE) {
    return next(createError(400, 'Chỉ đơn đang sử dụng mới được check-out'));
  }

  const bookingItems = await BookingItem.find({ bookingId });

  for (const item of bookingItems) {
    if (item.mode !== 'rent') continue;

    const eq = await Equipment.findById(item.equipmentId);
    if (!eq) continue;

    const stockFieldName = getStockFieldName(eq);

    eq[stockFieldName] = (eq[stockFieldName] || 0) + item.qty;

    if (typeof eq.rentedQuantity === 'number') {
      eq.rentedQuantity = Math.max(0, eq.rentedQuantity - item.qty);
    }

    await eq.save();
  }

  booking.status = BOOKING_STATUS.COMPLETED;
  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  io?.to(String(booking.courtId)).emit('booking_updated', {
    courtId: String(booking.courtId),
    date: booking.date.toISOString().slice(0, 10),
  });

  return res.json(createResponse(true, 200, 'Check-out thành công!', booking));
});

//* Admin cập nhật thanh toán
export const updateBooking = handleAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

  const { paymentStatus } = req.body;
  const previousPaymentStatus = booking.paymentStatus;

  if (paymentStatus && Object.values(PAYMENT_STATUS).includes(paymentStatus)) {
    booking.paymentStatus = paymentStatus;

    if (
      paymentStatus === PAYMENT_STATUS.PAID &&
      previousPaymentStatus !== PAYMENT_STATUS.PAID &&
      booking.voucherId &&
      booking.voucherUsageStatus === 'pending' &&
      booking.customerId
    ) {
      try {
        const usage = await commitVoucherUsage({
          voucherId: booking.voucherId,
          bookingId: booking._id,
          userId: booking.customerId,
          discountAmount: booking.voucherDiscount || 0,
          orderTotal: booking.fieldAmount || 0,
        });
        booking.voucherUsageId = usage._id;
        booking.voucherUsageStatus = 'applied';
      } catch (error) {
        console.error('❌ Lỗi khi commit voucher trong updateBooking:', error.message);
      }
    }
  }

  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');

  return res.json(createResponse(true, 200, 'Cập nhật booking thành công!', booking));
});

//* Admin sửa giờ / sân
export const updateBookingTime = handleAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

  const admin = req.user;
  if (!admin || admin.role !== USER_ROLES.ADMIN) {
    return next(createError(403, 'Chỉ admin mới được chỉnh sửa đặt sân!'));
  }

  const { courtId, date, startTime, endTime, slots } = req.body;

  if (!courtId || !date) {
    return next(createError(400, 'Thiếu sân hoặc ngày!'));
  }

  const court = await Court.findById(courtId);
  if (!court) return next(createError(404, 'Không tìm thấy sân!'));

  const newDate = new Date(date);
  if (Number.isNaN(newDate.getTime())) {
    return next(createError(400, 'Ngày đặt không hợp lệ!'));
  }

  let usedSlots =
    Array.isArray(slots) && slots.length > 0
      ? slots.filter((s) => s && s.startTime && s.endTime)
      : [];

  let finalStartTime = startTime;
  let finalEndTime = endTime;

  if (usedSlots.length > 0) {
    usedSlots.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    finalStartTime = usedSlots[0].startTime;
    finalEndTime = usedSlots[usedSlots.length - 1].endTime;
  }

  if (!finalStartTime || !finalEndTime) {
    return next(createError(400, 'Thiếu giờ bắt đầu / kết thúc!'));
  }

  let slotCount, fieldAmount, totalHours;

  if (usedSlots.length > 0) {
    ({ slotCount, fieldAmount, totalHours } = calcFieldPriceFromSlotsList(usedSlots, court));
  } else {
    ({ slotCount, fieldAmount, totalHours } = calcFieldPriceBySlots(
      finalStartTime,
      finalEndTime,
      court
    ));
  }

  if (slotCount === 0) {
    return next(createError(400, 'Khung giờ không hợp lệ hoặc nằm ngoài giờ hoạt động!'));
  }

  const day = new Date(newDate);
  day.setHours(0, 0, 0, 0);
  const nextDay = new Date(day);
  nextDay.setDate(day.getDate() + 1);

  const bookingsSameDay = await Booking.find({
    courtId,
    date: { $gte: day, $lt: nextDay },
    status: { $ne: BOOKING_STATUS.CANCELLED },
  });

  const requestSlots =
    usedSlots.length > 0 ? usedSlots : [{ startTime: finalStartTime, endTime: finalEndTime }];

  if (hasAnyOverlapWithBookings(requestSlots, bookingsSameDay, booking._id)) {
    return next(createError(400, 'Khung giờ này đã có người đặt!'));
  }

  const oldCourtId = booking.courtId;
  const oldDate = booking.date;

  booking.courtId = courtId;
  booking.date = newDate;
  booking.startTime = finalStartTime;
  booking.endTime = finalEndTime;
  booking.hours = totalHours;
  booking.fieldAmount = fieldAmount;
  booking.equipmentTotal = booking.equipmentTotal || 0;
  booking.discountTotal = booking.discountTotal || 0;
  booking.total = fieldAmount + booking.equipmentTotal - booking.discountTotal;
  booking.updatedAt = new Date();
  booking.slots = usedSlots.length > 0 ? usedSlots : undefined;

  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');

  const newDateStr = newDate.toISOString().slice(0, 10);
  const oldDateStr = oldDate.toISOString().slice(0, 10);

  io?.to(String(courtId)).emit('booking_updated', {
    courtId: String(courtId),
    date: newDateStr,
  });

  if (String(oldCourtId) !== String(courtId) || oldDateStr !== newDateStr) {
    io?.to(String(oldCourtId)).emit('booking_updated', {
      courtId: String(oldCourtId),
      date: oldDateStr,
    });
  }

  return res.json(createResponse(true, 200, 'Cập nhật giờ / sân thành công!', booking));
});

//* User gửi yêu cầu hoàn tiền
export const requestRefund = handleAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

  const user = req.user;
  const { accountNumber, accountName, bankName, note } = req.body;

  if (!user || String(booking.customerId) !== String(user._id)) {
    return next(createError(403, 'Bạn không có quyền yêu cầu hoàn tiền cho đơn này!'));
  }

  const allowStatuses = [BOOKING_STATUS.PENDING, BOOKING_STATUS.CANCELLED];
  if (!allowStatuses.includes(booking.status)) {
    return next(
      createError(400, 'Chỉ được yêu cầu hoàn tiền cho đơn đang chờ xác nhận hoặc đã hủy!')
    );
  }

  if (booking.status === BOOKING_STATUS.CANCELLED && booking.cancelBy === USER_ROLES.ADMIN) {
    return next(
      createError(
        400,
        'Đơn này đã bị admin hủy, vui lòng liên hệ quản lý để được hỗ trợ hoàn tiền!'
      )
    );
  }

  if (![PAYMENT_STATUS.PAID, PAYMENT_STATUS.PARTIAL].includes(booking.paymentStatus)) {
    return next(createError(400, 'Chỉ được yêu cầu hoàn tiền cho đơn đã thanh toán hoặc đã cọc!'));
  }

  if (!['none', 'rejected', undefined, null].includes(booking.refundStatus)) {
    return next(
      createError(400, 'Đơn này đang/đã được xử lý hoàn tiền, không thể gửi lại yêu cầu!')
    );
  }

  if (!accountNumber || !accountName || !bankName) {
    return next(createError(400, 'Vui lòng nhập đầy đủ thông tin tài khoản nhận tiền!'));
  }

  booking.refundAccountNumber = accountNumber.trim();
  booking.refundAccountName = accountName.trim();
  booking.refundBankName = bankName.trim();
  booking.refundNote = note?.trim() || '';
  booking.refundStatus = 'pending';

  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  io?.to(String(booking.courtId)).emit('booking_updated', {
    courtId: String(booking.courtId),
    date: booking.date.toISOString().slice(0, 10),
  });

  return res.json(
    createResponse(true, 200, 'Gửi yêu cầu hoàn tiền thành công! Vui lòng chờ xử lý.', booking)
  );
});

//* Admin cập nhật trạng thái hoàn tiền (dùng cho pending/processing)
export const updateRefundStatus = handleAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

  const admin = req.user;
  if (!admin || admin.role !== USER_ROLES.ADMIN) {
    return next(createError(403, 'Chỉ admin mới được cập nhật trạng thái hoàn tiền!'));
  }

  const { status, note, markPaymentRefunded } = req.body;
  const allowed = ['pending', 'processing', 'refunded', 'rejected'];

  if (!allowed.includes(status)) {
    return next(createError(400, 'Trạng thái hoàn tiền không hợp lệ!'));
  }

  const current = booking.refundStatus || 'pending';

  const FLOW = {
    pending: ['pending', 'processing'],
    processing: ['processing', 'refunded', 'rejected'],
    refunded: ['refunded'],
    rejected: ['rejected'],
  };

  const allowedNext = FLOW[current] || [];

  if (!allowedNext.includes(status)) {
    return next(
      createError(400, `Không thể chuyển trực tiếp từ trạng thái "${current}" sang "${status}"!`)
    );
  }

  booking.refundStatus = status;

  if (note && note.trim()) {
    booking.refundNote = note.trim();
  }

  if (status === 'refunded' && markPaymentRefunded !== false) {
    booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
  }

  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  io?.to(String(booking.courtId)).emit('booking_updated', {
    courtId: String(booking.courtId),
    date: booking.date.toISOString().slice(0, 10),
  });

  return res.json(createResponse(true, 200, 'Cập nhật hoàn tiền thành công!', booking));
});

//* DASHBOARD ADMIN
export const getAdminDashboardBookings = handleAsync(async (req, res, next) => {
  const [total, pending, confirmed, inUse, completed, cancelled] = await Promise.all([
    Booking.countDocuments(),
    Booking.countDocuments({ status: BOOKING_STATUS.PENDING }),
    Booking.countDocuments({ status: BOOKING_STATUS.CONFIRMED }),
    Booking.countDocuments({ status: BOOKING_STATUS.IN_USE }),
    Booking.countDocuments({ status: BOOKING_STATUS.COMPLETED }),
    Booking.countDocuments({ status: BOOKING_STATUS.CANCELLED }),
  ]);

  return res.json(
    createResponse(true, 200, 'Thống kê booking thành công!', {
      total,
      pending,
      confirmed,
      inUse,
      completed,
      cancelled,
    })
  );
});

//* GET ALL (ADMIN + USER)
export const getBookings = handleAsync(async (req, res, next) => {
  const role = req.user?.role;
  const baseFilter = role === USER_ROLES.ADMIN ? {} : { customerId: req.user._id };

  const bookings = await Booking.find(baseFilter)
    .populate('courtId', 'name type images image address')
    .populate('customerId', 'name username phone email')
    .populate('voucherId', 'code discountType discountValue maxDiscountValue')
    .sort({ createdAt: -1 })
    .lean();

  const bookingIds = bookings.map((b) => b._id);

  // Get orderIds of our bookings to query invoices for any sibling in the same order
  const orderIds = bookings.map((b) => b.orderId ? String(b.orderId._id || b.orderId) : null).filter(Boolean);
  const siblingMap = new Map(); // bookingId -> orderId string
  let allRelatedBookingIds = [...bookingIds];

  if (orderIds.length > 0) {
    const siblings = await Booking.find(
      { orderId: { $in: orderIds } },
      { _id: 1, orderId: 1 }
    ).lean();
    siblings.forEach((s) => {
      siblingMap.set(String(s._id), String(s.orderId));
    });
    allRelatedBookingIds = Array.from(new Set([...bookingIds, ...siblings.map((s) => s._id)]));
  }

  const invoices = await InvoiceModel.find(
    { bookingId: { $in: allRelatedBookingIds } },
    { _id: 1, bookingId: 1 }
  ).lean();

  const invoiceMap = new Map();
  const orderInvoiceMap = new Map();

  for (const inv of invoices) {
    const bId = String(inv.bookingId);
    const invId = String(inv._id);
    invoiceMap.set(bId, invId);

    const ordId = siblingMap.get(bId);
    if (ordId) {
      orderInvoiceMap.set(ordId, invId);
    }
  }

  // Populate invoiceMap for any sibling that shares the order invoice
  bookings.forEach((b) => {
    const bId = String(b._id);
    if (invoiceMap.has(bId)) return;

    const ordId = b.orderId ? String(b.orderId._id || b.orderId) : null;
    if (ordId && orderInvoiceMap.has(ordId)) {
      invoiceMap.set(bId, orderInvoiceMap.get(ordId));
    }
  });

  //  FIX: trả thêm canRetryPayment + amountToPay để FE khỏi đoán
  const enriched = bookings.map((b) => {
    const hasInvoice = invoiceMap.has(String(b._id));
    const invoiceId = invoiceMap.get(String(b._id)) || null;

    const isOnline = [PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(
      String(b.paymentMethod || '').toLowerCase()
    );

    const payStatus = String(b.paymentStatus || '').toLowerCase();
    const depPaid = b.depositStatus === DEPOSIT_STATUS.PAID ? Number(b.depositAmount || 0) : 0;

    const total = Math.max(
      0,
      Number(b.total || 0) > 0
        ? Number(b.total || 0)
        : Number(b.fieldAmount || 0) + Number(b.equipmentTotal || 0) - Number(b.discountTotal || 0)
    );

    const paid = [PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED].includes(payStatus)
      ? total
      : Math.min(depPaid, total);

    const amountToPay = Math.max(0, total - paid);

    const canRetryPayment =
      isOnline && !hasInvoice && b.status === BOOKING_STATUS.PENDING && amountToPay > 0;

    return {
      ...b,
      invoiceId,
      hasInvoice,
      amountToPay,
      canRetryPayment,
    };
  });

  return res.json(createResponse(true, 200, 'Lấy danh sách booking thành công!', enriched));
});

//* GET BY USER
export const getBookingsByUser = handleAsync(async (req, res, next) => {
  const targetUserId = req.params.userId || req.user?.id || req.user?._id;
  if (!targetUserId) return next(createError(400, 'Thiếu userId!'));

  const callerId = req.user?.id || req.user?._id?.toString();
  if (req.user?.role !== USER_ROLES.ADMIN && String(targetUserId) !== String(callerId)) {
    return next(createError(403, 'Bạn không có quyền xem danh sách đơn hàng của người dùng khác!'));
  }

  const bookings = await Booking.find({ customerId: targetUserId })
    .populate('courtId', 'name type images image address')
    .populate('customerId', 'name username phone email')
    .populate('voucherId', 'code discountType discountValue maxDiscountValue')
    .sort({ createdAt: -1 })
    .lean();

  const bookingIds = bookings.map((b) => b._id);

  const items = await BookingItem.find({ bookingId: { $in: bookingIds } })
    .select('bookingId name mode qty price subtotal unit')
    .lean();

  const itemsByBooking = {};
  for (const it of items) {
    const key = String(it.bookingId);
    if (!itemsByBooking[key]) itemsByBooking[key] = [];
    itemsByBooking[key].push({
      name: it.name,
      mode: it.mode,
      qty: it.qty,
      unit: it.unit,
      price: it.price,
      subtotal: it.subtotal,
    });
  }

  // Get orderIds of our bookings to query invoices for any sibling in the same order
  const orderIds = bookings.map((b) => b.orderId ? String(b.orderId._id || b.orderId) : null).filter(Boolean);
  const siblingMap = new Map(); // bookingId -> orderId string
  let allRelatedBookingIds = [...bookingIds];

  if (orderIds.length > 0) {
    const siblings = await Booking.find(
      { orderId: { $in: orderIds } },
      { _id: 1, orderId: 1 }
    ).lean();
    siblings.forEach((s) => {
      siblingMap.set(String(s._id), String(s.orderId));
    });
    allRelatedBookingIds = Array.from(new Set([...bookingIds, ...siblings.map((s) => s._id)]));
  }

  const invoices = await InvoiceModel.find(
    { bookingId: { $in: allRelatedBookingIds } },
    { _id: 1, bookingId: 1, total: 1, status: 1, paidAt: 1, createdAt: 1 }
  )
    .sort({ createdAt: -1 })
    .lean();

  const invoiceMap = new Map();
  const orderInvoiceMap = new Map();

  for (const inv of invoices) {
    const bId = String(inv.bookingId);
    invoiceMap.set(bId, inv);

    const ordId = siblingMap.get(bId);
    if (ordId) {
      orderInvoiceMap.set(ordId, inv);
    }
  }

  // Populate invoiceMap for any sibling that shares the order invoice
  bookings.forEach((b) => {
    const bId = String(b._id);
    if (invoiceMap.has(bId)) return;

    const ordId = b.orderId ? String(b.orderId._id || b.orderId) : null;
    if (ordId && orderInvoiceMap.has(ordId)) {
      invoiceMap.set(bId, orderInvoiceMap.get(ordId));
    }
  });

  const result = bookings.map((b) => {
    const id = String(b._id);

    const equipmentItems = itemsByBooking[id] || [];

    const equipmentTotalFromItems = equipmentItems.reduce(
      (sum, it) => sum + Number(it.subtotal || 0),
      0
    );
    const equipmentTotal = Math.max(Number(b.equipmentTotal || 0), equipmentTotalFromItems);

    const fieldAmount = Number(b.fieldAmount || 0);
    const discountTotal = Number(b.discountTotal || 0);

    const fieldDue = Math.max(0, fieldAmount - discountTotal);

    const currentTotal =
      Number(b.total || 0) > 0
        ? Number(b.total || 0)
        : Math.max(0, fieldAmount + equipmentTotal - discountTotal);

    const inv = invoiceMap.get(id) || null;
    const hasInvoice = !!inv;

    const paymentMethod = String(b.paymentMethod || '').toLowerCase();
    const paymentStatus = String(b.paymentStatus || '').toLowerCase();

    const depPaid = b.depositStatus === DEPOSIT_STATUS.PAID ? Number(b.depositAmount || 0) : 0;

    let paidTotal = 0;

    if (hasInvoice) {
      paidTotal = currentTotal;
    } else if ([PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED].includes(paymentStatus)) {
      paidTotal = currentTotal;
    } else if (depPaid > 0) {
      paidTotal = Math.min(depPaid, currentTotal);
    } else {
      paidTotal = 0;
    }

    const fieldPaid = Math.min(paidTotal, fieldDue);
    const equipmentPaid = Math.max(0, paidTotal - fieldPaid);
    const equipmentUnpaid = Math.max(0, equipmentTotal - equipmentPaid);
    const unpaidAmount = Math.max(0, currentTotal - paidTotal);

    //  FIX: canRetryPayment theo chuẩn BE (không invoice + pending + online + còn nợ)
    const isOnline = [PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(paymentMethod);
    const canRetryPayment =
      isOnline && !hasInvoice && b.status === BOOKING_STATUS.PENDING && unpaidAmount > 0;

    return {
      ...b,
      equipmentItems,

      equipmentTotal,
      currentTotal,

      hasInvoice,
      invoiceId: inv ? String(inv._id) : null,
      invoiceCollected: inv ? Number(inv.total || 0) : 0,

      paidTotal,
      unpaidAmount,
      fieldPaid,
      equipmentPaid,
      equipmentUnpaid,

      canRetryPayment,
    };
  });

  return res.json(
    createResponse(true, 200, 'Lấy danh sách booking của người dùng thành công!', result)
  );
});

// * Lấy thông tin để thanh toán lại (booking lẻ HOẶC đơn gộp)
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id || ''));
const safeNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const getRetryPaymentInfo = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    if (!isValidObjectId(bookingId)) {
      return res.status(400).json({ success: false, message: 'bookingId không hợp lệ' });
    }

    const booking = await Booking.findById(bookingId).lean();
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy booking' });
    }

    // Ownership Check: Caller must own the booking or be admin
    if (req.user && req.user.role !== USER_ROLES.ADMIN) {
      const callerId = req.user.id || req.user._id?.toString();
      if (booking.customerId && String(booking.customerId) !== String(callerId)) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền xem thông tin thanh toán của đơn hàng này.',
        });
      }
    }

    // chỉ retry cho đơn online
    const method = String(booking.paymentMethod || '').toLowerCase();
    const isOnline = [PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(method);
    if (!isOnline) {
      return res.status(400).json({
        success: false,
        message: 'Đơn này không hỗ trợ thanh toán lại (chỉ áp dụng VNPAY/MOMO)',
      });
    }

    const bookings = booking.orderId
      ? await Booking.find({
          orderId: booking.orderId,
          customerId: booking.customerId,
        }).lean()
      : [booking];

    if (bookings.some((b) => b.status === BOOKING_STATUS.CANCELLED)) {
      return res.status(400).json({
        success: false,
        message: 'Đơn đã bị huỷ, không thể thanh toán lại',
      });
    }

    const ids = bookings.map((b) => b._id);

    //  FIX: đã có invoice => coi như đã chốt thanh toán => cấm retry
    const invCount = await InvoiceModel.countDocuments({ bookingId: { $in: ids } });
    if (invCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Đơn đã được thanh toán (đã có hoá đơn), không thể thanh toán lại',
      });
    }

    const itemsAgg = await BookingItem.aggregate([
      { $match: { bookingId: { $in: ids } } },
      { $group: { _id: '$bookingId', total: { $sum: '$subtotal' } } },
    ]);

    const equipmentMap = new Map(itemsAgg.map((r) => [String(r._id), safeNum(r.total)]));

    const calcTotal = (b) => {
      const field = safeNum(b.fieldAmount);
      const discount = safeNum(b.discountTotal);

      const eqAgg = equipmentMap.get?.(String(b._id)) || 0;
      const eqStored = safeNum(b.equipmentTotal);
      const eqTotal = Math.max(eqAgg, eqStored);

      return Math.max(0, field + eqTotal - discount);
    };

    const calcPaid = (b) => {
      const totalB = calcTotal(b);
      const payStatus = String(b.paymentStatus || '').toLowerCase();

      //  nếu PAID/REFUNDED => coi như trả đủ
      if ([PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED].includes(payStatus)) {
        return totalB;
      }

      const dep = b.depositStatus === DEPOSIT_STATUS.PAID ? safeNum(b.depositAmount) : 0;
      return Math.min(dep, totalB);
    };

    const total = bookings.reduce((sum, b) => sum + calcTotal(b), 0);
    const paidTotal = bookings.reduce((sum, b) => sum + calcPaid(b), 0);
    const amountToPay = Math.max(0, total - paidTotal);

    if (amountToPay <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Đơn đã thanh toán đủ, không cần thanh toán lại',
      });
    }

    return res.json({
      success: true,
      data: {
        bookingId: String(booking._id),
        orderId: booking.orderId ? String(booking.orderId) : null,
        bookingIds: ids.map(String),
        total,
        paidTotal,
        amountToPay,
        type: bookings.length > 1 ? 'order' : 'single',
      },
    });
  } catch (err) {
    next(err);
  }
};

//*từ chối hoàn tiền
export const rejectRefundBooking = handleAsync(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;

  const booking = await Booking.findById(id);
  if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));

  if (booking.refundStatus !== 'processing') {
    return next(createError(400, 'Chỉ xử lý đơn đang ở trạng thái "Đang hoàn tiền"!'));
  }

  booking.refundStatus = 'rejected';
  booking.refundAdminReason = reason || '';
  booking.refundProcessedAt = new Date();

  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  if (booking.customerId) {
    io?.to(String(booking.customerId)).emit('booking_refund_updated', {
      bookingId: booking._id,
    });
  }

  return res.status(200).json(createResponse(true, 200, 'Đã từ chối yêu cầu hoàn tiền', booking));
});

//* hoàn tiền xong (upload bill)
export const completeRefundBooking = handleAsync(async (req, res, next) => {
  const { id } = req.params;
  const { billImage } = req.body;

  const booking = await Booking.findById(id);
  if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));

  if (booking.refundStatus !== 'processing') {
    return next(createError(400, 'Chỉ hoàn tiền xong cho đơn đang ở trạng thái "Đang hoàn tiền"!'));
  }

  if (!billImage) {
    return next(createError(400, 'Thiếu link ảnh hoá đơn hoàn tiền'));
  }

  booking.refundStatus = 'refunded';
  booking.refundBillImage = billImage;
  booking.refundProcessedAt = new Date();

  booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
  if (booking.depositAmount > 0) {
    booking.depositStatus = DEPOSIT_STATUS.REFUNDED;
  }

  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  if (booking.customerId) {
    io?.to(String(booking.customerId)).emit('booking_refund_updated', {
      bookingId: booking._id,
    });
  }

  return res
    .status(200)
    .json(createResponse(true, 200, 'Đã cập nhật hoàn tiền thành công', booking));
});

// * Thuê thêm thiết bị khi đang sử dụng
export const addEquipmentsBooking = handleAsync(async (req, res, next) => {
  const bookingId = req.params.id;
  const { items = [] } = req.body;

  const booking = await Booking.findById(bookingId);
  if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));

  if (booking.status !== BOOKING_STATUS.IN_USE) {
    return next(createError(400, 'Chỉ đơn đang sử dụng mới được thêm thiết bị'));
  }

  for (const item of items) {
    const { equipmentId, mode, qty, price } = item;
    const realQty = Number(qty || 0);
    if (!equipmentId || realQty <= 0) continue;

    const eq = await Equipment.findById(equipmentId);
    if (!eq) return next(createError(404, `Thiết bị không tồn tại`));

    const stockFieldName = getStockFieldName(eq);
    const currentStock = Number(eq[stockFieldName] || 0);

    if (currentStock < realQty) {
      return next(
        createError(
          400,
          `Thiết bị ${eq.name} không đủ số lượng (còn ${currentStock}, yêu cầu ${realQty})`
        )
      );
    }

    const unitPrice =
      typeof price === 'number' && price > 0
        ? price
        : mode === 'sell'
          ? Number(eq.salePrice || 0)
          : Number(eq.rentPrice || 0);

    const lineSubtotal = unitPrice * realQty;

    // trừ kho
    eq[stockFieldName] = currentStock - realQty;
    if (mode === 'rent') eq.rentedQuantity = (eq.rentedQuantity || 0) + realQty;

    await eq.save();

    await BookingItem.create({
      bookingId,
      equipmentId,
      mode,
      qty: realQty,
      price: unitPrice,
      subtotal: lineSubtotal,
      name: eq.name,
      unit: eq.unit || 'cái',
    });
  }

  // Recalc equipmentTotal từ DB (chuẩn nhất)
  const agg = await BookingItem.aggregate([
    { $match: { bookingId: booking._id } },
    { $group: { _id: '$bookingId', total: { $sum: '$subtotal' } } },
  ]);
  const equipmentTotalFromDb = Number(agg?.[0]?.total || 0);

  booking.equipmentTotal = equipmentTotalFromDb;
  booking.total = Math.max(
    0,
    Number(booking.fieldAmount || 0) + equipmentTotalFromDb - Number(booking.discountTotal || 0)
  );

  // online: phát sinh thêm tiền thì paymentStatus phải tự hạ theo depositAmount
  if ([PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.MOMO].includes(booking.paymentMethod)) {
    recalcPaymentStatusByDeposit(booking);
  }

  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  io?.to(String(booking.courtId)).emit('booking_updated', {
    courtId: String(booking.courtId),
    date: booking.date.toISOString().slice(0, 10),
  });

  return res.json(createResponse(true, 200, 'Đã thêm thiết bị cho đơn đang sử dụng!', booking));
});

// * Admin xem chi tiết booking + thiết bị
export const getBookingDetailAdmin = handleAsync(async (req, res, next) => {
  const bookingId = req.params.id;

  const booking = await Booking.findById(bookingId)
    .populate('courtId', 'name type images address')
    .populate('customerId', 'name username phone email')
    .lean();

  if (!booking) return next(createError(404, 'Không tìm thấy đơn đặt sân'));

  const items = await BookingItem.find({ bookingId })
    .select('name mode qty price subtotal unit')
    .lean();

  return res.json(
    createResponse(true, 200, 'Lấy chi tiết booking thành công!', {
      booking,
      items,
    })
  );
});

// * Lấy danh sách thiết bị của 1 booking (cho modal Xem chi tiết / Thêm thiết bị)
export const getBookingEquipmentsDetail = handleAsync(async (req, res, next) => {
  const bookingId = req.params.id;

  const items = await BookingItem.find({ bookingId }).populate('equipmentId', 'name unit').lean();

  if (!items) {
    return next(createError(404, 'Không tìm thấy thiết bị cho đơn này!'));
  }

  return res.json(
    createResponse(true, 200, 'Lấy danh sách thiết bị của booking thành công!', items)
  );
});

// * ADMIN hủy đơn thanh toán tiền mặt (COD / cọc tại quầy)
export const adminCancelCashBooking = handleAsync(async (req, res, next) => {
  const { id } = req.params;
  const { refundDeposit, adminReason } = req.body;

  const admin = req.user;
  if (!admin || admin.role !== USER_ROLES.ADMIN) {
    return next(createError(403, 'Chỉ admin mới được hủy đơn tiền mặt!'));
  }

  const booking = await Booking.findById(id);
  if (!booking) return next(createError(404, 'Không tìm thấy booking!'));

  if ([BOOKING_STATUS.IN_USE, BOOKING_STATUS.COMPLETED].includes(booking.status)) {
    return next(createError(400, 'Đơn đang sử dụng/đã hoàn tất, không thể hủy!'));
  }

  if (booking.paymentMethod !== PAYMENT_METHOD.CASH) {
    return next(
      createError(
        400,
        'API này chỉ dùng cho đơn thanh toán tiền mặt/COD. Đơn online dùng luồng hoàn tiền riêng!'
      )
    );
  }

  if (booking.depositAmount > 0 && booking.depositStatus === DEPOSIT_STATUS.PAID) {
    if (refundDeposit) {
      booking.depositStatus = DEPOSIT_STATUS.REFUNDED;
      booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
      booking.refundStatus = 'refunded';
      booking.refundProcessedAt = new Date();
      booking.refundAmount = booking.depositAmount || 0;
      booking.refundAdminReason =
        adminReason?.trim() || 'Admin hủy đơn thanh toán tiền mặt và đã trả lại tiền cọc cho khách';
    } else {
      booking.refundStatus = booking.refundStatus || 'none';
      booking.refundAmount = 0;
      booking.refundAdminReason =
        adminReason?.trim() || 'Admin hủy đơn, admin giữ tiền cọc theo chính sách hủy sân';
    }
  } else if (booking.depositAmount === 0 && booking.paymentStatus === PAYMENT_STATUS.PAID) {
    if (refundDeposit) {
      booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
      booking.refundStatus = 'refunded';
      booking.refundProcessedAt = new Date();
      booking.refundAmount = booking.total || 0;
      booking.refundAdminReason =
        adminReason?.trim() ||
        'Admin hủy đơn thanh toán tiền mặt và đã hoàn lại toàn bộ tiền cho khách';
    } else {
      booking.refundStatus = booking.refundStatus || 'none';
      booking.refundAmount = 0;
      booking.refundAdminReason =
        adminReason?.trim() || 'Admin hủy đơn, CLB không hoàn tiền (theo chính sách)';
    }
  } else {
    booking.refundStatus = booking.refundStatus || 'none';
    booking.refundAmount = 0;
    if (adminReason?.trim()) {
      booking.refundAdminReason = adminReason.trim();
    }
  }

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancelledAt = new Date();
  booking.updatedAt = new Date();
  booking.cancelBy = USER_ROLES.ADMIN;

  if (adminReason?.trim()) {
    booking.cancelReason = adminReason.trim();
  }

  await booking.save();

  const io = req.app.get('io');
  io?.emit('booking_global_updated');
  io?.to(String(booking.courtId)).emit('booking_updated', {
    courtId: String(booking.courtId),
    date: booking.date.toISOString().slice(0, 10),
  });

  return res.json(
    createResponse(true, 200, 'Admin đã hủy đơn tiền mặt và cập nhật trạng thái hoàn tiền', booking)
  );
});
