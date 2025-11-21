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
import { pushStatusChange } from "../bookings/booking.helpers.js";

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

const updatePaymentSuccess = async (booking, transactionId, req = null) => {
  if (!booking) {
    console.error("❌ updatePaymentSuccess - Booking is null");
    return;
  }
  
  console.log("🔄 updatePaymentSuccess - Starting update for booking:", booking._id, {
    currentStatus: booking.status,
    currentPaymentStatus: booking.paymentStatus,
    transactionId,
  });
  
  // Tạo request object giả nếu không có (cho IPN callback)
  const fakeReq = req || {
    user: booking.customerId ? { _id: booking.customerId } : null
  };

  // Nếu booking đang ở pending, chuyển sang confirmed khi thanh toán thành công
  const nextStatus = booking.status === "pending" ? "confirmed" : booking.status;
  
  console.log("🔄 updatePaymentSuccess - Will update status to:", nextStatus);
  
  // Sử dụng pushStatusChange để cập nhật status và statusHistory (tự động qua pre-save hook)
  if (nextStatus !== booking.status) {
    console.log("📝 updatePaymentSuccess - Status will change, using pushStatusChange");
    await pushStatusChange({
      booking,
      nextStatus,
      req: fakeReq,
      action: "payment_success",
      note: `VNPay thanh toán thành công. Mã giao dịch: ${transactionId || "N/A"}`,
      mutate: (doc) => {
        doc.paymentStatus = "paid";
        doc.depositMethod = "vnpay";
        doc.depositStatus = doc.depositRequired ? "paid" : doc.depositStatus;
        doc.depositTxnId = transactionId || doc.depositTxnId;
      },
    });
    console.log("✅ updatePaymentSuccess - pushStatusChange completed");
  } else {
    console.log("📝 updatePaymentSuccess - Status unchanged, updating payment info only");
    // Nếu status không đổi, vẫn cần thêm vào statusHistory để tracking
    // Set $locals để pre-save hook có thể sử dụng
    booking.$locals = booking.$locals || {};
    booking.$locals.actorId = booking.customerId?._id ?? booking.customerId ?? null;
    booking.$locals.statusAction = "payment_success";
    booking.$locals.statusNote = `VNPay thanh toán thành công. Mã giao dịch: ${transactionId || "N/A"}`;
    
    // Cập nhật payment info
    booking.paymentStatus = "paid";
    booking.depositMethod = "vnpay";
    booking.depositStatus = booking.depositRequired ? "paid" : booking.depositStatus;
    booking.depositTxnId = transactionId || booking.depositTxnId;
    
    // Manually thêm vào statusHistory vì status không đổi nên pre-save hook không chạy
    booking.appendStatusHistory({
      status: booking.status,
      action: "payment_success",
      note: `VNPay thanh toán thành công. Mã giao dịch: ${transactionId || "N/A"}`,
      userId: booking.customerId?._id ?? booking.customerId ?? null,
    });
    
    await booking.save();
    console.log("✅ updatePaymentSuccess - Booking saved with payment info updated");
  }
  
  // Reload booking để đảm bảo có dữ liệu mới nhất
  await booking.populate([
    { path: "customerId", select: "name phone email username" },
    { path: "courtId", select: "name code type basePrice peakPrice images" },
  ]);
  
  console.log("✅ updatePaymentSuccess - Final status:", {
    id: booking._id.toString(),
    code: booking.code,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    depositTxnId: booking.depositTxnId,
  });
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
    console.log("🔔 VNPay Return Callback received:", req.query);
    ensureEnv();
    const { isValid, params } = verifyVnpParams(req.query);
    const bookingCode = params.vnp_TxnRef;
    const responseCode = params.vnp_ResponseCode;
    
    console.log("📋 VNPay Return - bookingCode:", bookingCode, "responseCode:", responseCode, "isValid:", isValid);
    
    const booking = await Booking.findOne({ code: bookingCode });

    if (!isValid || !booking) {
      console.error("❌ VNPay Return - Invalid callback or booking not found:", { isValid, bookingCode, bookingExists: !!booking });
      const redirectUrl = getSuccessRedirectUrl("failed", "", "Thanh toán không hợp lệ.");
      return res.redirect(redirectUrl);
    }

    console.log("✅ VNPay Return - Booking found:", booking._id, "Current paymentStatus:", booking.paymentStatus);

    if (responseCode === "00") {
      console.log("💰 VNPay Return - Payment successful, updating booking...");
      await updatePaymentSuccess(booking, params.vnp_TransactionNo, req);
      console.log("✅ VNPay Return - Booking updated successfully. New paymentStatus:", booking.paymentStatus, "New status:", booking.status);
      const redirectUrl = getSuccessRedirectUrl("success", booking._id.toString(), "Thanh toán thành công.");
      return res.redirect(redirectUrl);
    }

    console.warn("⚠️ VNPay Return - Payment failed or cancelled. responseCode:", responseCode);
    const redirectUrl = getSuccessRedirectUrl("failed", booking._id.toString(), "Thanh toán thất bại hoặc bị hủy.");
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("❌ VNPay Return - Error:", error);
    const redirectUrl = getSuccessRedirectUrl("failed", "", "Có lỗi xảy ra khi xử lý thanh toán.");
    return res.redirect(redirectUrl);
  }
};

export const confirmManualPayment = async (req, res, next) => {
  try {
    const { bookingId, transactionId } = req.body || {};
    if (!bookingId) {
      return res.status(400).json({ message: "bookingId is required" });
    }

    console.log("🔔 Manual Payment Confirmation - bookingId:", bookingId, "transactionId:", transactionId);

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      console.error("❌ Manual Payment - Booking not found:", bookingId);
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }

    // Kiểm tra quyền
    const isOwner = isBookingOwner(booking, req.user);
    const isAdmin = req.user?.role === USER_ROLES.ADMIN;
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Bạn không có quyền xác nhận thanh toán booking này" });
    }

    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ message: "Booking đã được thanh toán" });
    }

    console.log("💰 Manual Payment - Confirming payment for booking:", booking.code);
    await updatePaymentSuccess(booking, transactionId || `MANUAL_${Date.now()}`, req);
    
    await booking.populate([
      { path: "customerId", select: "name phone email username" },
      { path: "courtId", select: "name code type basePrice peakPrice images" },
    ]);

    console.log("✅ Manual Payment - Payment confirmed successfully");
    return res.json({
      message: "Xác nhận thanh toán thành công",
      data: booking,
    });
  } catch (error) {
    console.error("❌ Manual Payment - Error:", error);
    return next(error);
  }
};

export const vnPayIpn = async (req, res) => {
  try {
    console.log("🔔 VNPay IPN Callback received:", req.query);
    ensureEnv();
    const { isValid, params } = verifyVnpParams(req.query);
    const responseCode = params.vnp_ResponseCode;
    const bookingCode = params.vnp_TxnRef;

    console.log("📋 VNPay IPN - bookingCode:", bookingCode, "responseCode:", responseCode, "isValid:", isValid);

    if (!isValid) {
      console.error("❌ VNPay IPN - Invalid checksum");
      return res.json({ RspCode: "97", Message: "Checksum failed" });
    }

    const booking = await Booking.findOne({ code: bookingCode });
    if (!booking) {
      console.error("❌ VNPay IPN - Booking not found:", bookingCode);
      return res.json({ RspCode: "01", Message: "Order not found" });
    }

    console.log("✅ VNPay IPN - Booking found:", booking._id, "Current paymentStatus:", booking.paymentStatus);

    if (responseCode === "00") {
      console.log("💰 VNPay IPN - Payment successful, updating booking...");
      await updatePaymentSuccess(booking, params.vnp_TransactionNo, req);
      console.log("✅ VNPay IPN - Booking updated successfully. New paymentStatus:", booking.paymentStatus, "New status:", booking.status);
      return res.json({ RspCode: "00", Message: "Confirm Success" });
    }

    console.warn("⚠️ VNPay IPN - Payment failed. responseCode:", responseCode);
    return res.json({ RspCode: "02", Message: "Payment failed" });
  } catch (error) {
    console.error("❌ VNPay IPN - Error:", error);
    return res.json({ RspCode: "99", Message: "Unknown error" });
  }
};

