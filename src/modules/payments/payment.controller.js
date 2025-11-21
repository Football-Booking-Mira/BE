import querystring from "querystring";
import Booking from "../bookings/booking.models.js";
import {
  FRONT_END_URL,
  VNPAY_CANCEL_REDIRECT,
  VNPAY_HASH_SECRET,
  VNPAY_IPN_URL,
  VNPAY_PAYMENT_URL,
  VNPAY_RETURN_URL,
  VNPAY_SUCCESS_REDIRECT,
  VNPAY_TMN_CODE,
} from "../../common/config/environment.js";
import { createSecureHash, formatVnpDate, getClientIp, sortObject } from "./payment.utils.js";
import { isBookingOwner } from "../bookings/booking.utils.js";
import { USER_ROLES } from "../../common/constants/enums.js";

const ensureEnv = () => {
  if (!VNPAY_TMN_CODE || !VNPAY_HASH_SECRET || !VNPAY_PAYMENT_URL) {
    throw new Error("Missing VNPay configuration");
  }
};

const getSuccessRedirectUrl = (status, bookingId, message = "") => {
  const defaultResultUrl = `${FRONT_END_URL || "http://localhost:5173"}/payment/result`;
  const preferredBase =
    status === "success"
      ? VNPAY_SUCCESS_REDIRECT || defaultResultUrl
      : VNPAY_CANCEL_REDIRECT || defaultResultUrl;

  const url = new URL(preferredBase);
  url.searchParams.set("status", status);
  if (bookingId) url.searchParams.set("bookingId", bookingId);
  if (message) url.searchParams.set("message", message);
  return url.toString();
};

const updatePaymentSuccess = async (booking, transactionId) => {
  if (!booking) return;
  booking.paymentStatus = "paid";
  booking.payment = booking.payment || {};
  booking.payment.paymentMethod = "vnpay";
  booking.payment.depositStatus = booking.depositRequired ? "paid" : booking.payment.depositStatus;
  booking.payment.depositTxnId = transactionId || booking.payment.depositTxnId;
  if (booking.status === "pending") {
    booking.status = "confirmed";
  }
  booking.$locals = {
    actorId: booking.customerId?._id ?? booking.customerId,
    statusAction: "payment_success",
    statusNote: "VNPay thanh toán thành công.",
  };
  await booking.save();
};

export const createVnPayPayment = async (req, res, next) => {
  try {
    ensureEnv();
    const { bookingId, bankCode } = req.body || {};
    if (!bookingId) {
      return res.status(400).json({ message: "bookingId is required" });
    }

    const booking = await Booking.findById(bookingId).populate("customerId", "name email");
    if (!booking) {
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }

    const isOwner = isBookingOwner(booking, req.user);
    const isAdmin = req.user?.role === USER_ROLES.ADMIN;
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Bạn không có quyền thanh toán booking này" });
    }

    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ message: "Booking đã được thanh toán" });
    }

    const amount = Math.max(booking.totals?.total ?? booking.total ?? 0, 0);
    const createDate = formatVnpDate(new Date());
    const expireDate = formatVnpDate(new Date(Date.now() + 15 * 60 * 1000));

    let vnpParams = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: VNPAY_TMN_CODE,
      vnp_Locale: "vn",
      vnp_CurrCode: "VND",
      vnp_TxnRef: booking.code,
      vnp_OrderInfo: `Thanh toán đơn đặt sân ${booking.code}`,
      vnp_OrderType: "other",
      vnp_Amount: Math.round(amount * 100),
      vnp_ReturnUrl: VNPAY_RETURN_URL,
      vnp_IpAddr: getClientIp(req),
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    if (bankCode) {
      vnpParams.vnp_BankCode = bankCode;
    }

    vnpParams = sortObject(vnpParams);
    const signData = querystring.stringify(vnpParams, { encode: false });
    const secureHash = createSecureHash(signData, VNPAY_HASH_SECRET);
    vnpParams.vnp_SecureHash = secureHash;

    const paymentUrl = `${VNPAY_PAYMENT_URL}?${querystring.stringify(vnpParams, { encode: false })}`;
    return res.json({ paymentUrl });
  } catch (error) {
    return next(error);
  }
};

const verifyVnpParams = (query) => {
  const params = { ...query };
  const secureHash = params.vnp_SecureHash;
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;
  const sorted = sortObject(params);
  const signData = querystring.stringify(sorted, { encode: false });
  const checkSum = createSecureHash(signData, VNPAY_HASH_SECRET);
  return { isValid: secureHash === checkSum, params };
};

export const vnPayReturn = async (req, res) => {
  try {
    ensureEnv();
    const { isValid, params } = verifyVnpParams(req.query);
    const bookingCode = params.vnp_TxnRef;
    const responseCode = params.vnp_ResponseCode;
    const booking = await Booking.findOne({ code: bookingCode });

    if (!isValid || !booking) {
      const redirectUrl = getSuccessRedirectUrl("failed", "", "Thanh toán không hợp lệ.");
      return res.redirect(redirectUrl);
    }

    if (responseCode === "00") {
      await updatePaymentSuccess(booking, params.vnp_TransactionNo);
      const redirectUrl = getSuccessRedirectUrl("success", booking._id.toString(), "Thanh toán thành công.");
      return res.redirect(redirectUrl);
    }

    const redirectUrl = getSuccessRedirectUrl("failed", booking._id.toString(), "Thanh toán thất bại hoặc bị hủy.");
    return res.redirect(redirectUrl);
  } catch (error) {
    const redirectUrl = getSuccessRedirectUrl("failed", "", "Có lỗi xảy ra khi xử lý thanh toán.");
    return res.redirect(redirectUrl);
  }
};

export const vnPayIpn = async (req, res) => {
  try {
    ensureEnv();
    const { isValid, params } = verifyVnpParams(req.query);
    const responseCode = params.vnp_ResponseCode;
    const bookingCode = params.vnp_TxnRef;

    if (!isValid) {
      return res.json({ RspCode: "97", Message: "Checksum failed" });
    }

    const booking = await Booking.findOne({ code: bookingCode });
    if (!booking) {
      return res.json({ RspCode: "01", Message: "Order not found" });
    }

    if (responseCode === "00") {
      await updatePaymentSuccess(booking, params.vnp_TransactionNo);
      return res.json({ RspCode: "00", Message: "Confirm Success" });
    }

    return res.json({ RspCode: "02", Message: "Payment failed" });
  } catch (error) {
    return res.json({ RspCode: "99", Message: "Unknown error" });
  }
};

