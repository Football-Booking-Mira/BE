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
    throw new Error("Booking is required");
  }
  
  console.log("🔄 updatePaymentSuccess - Starting update for booking:", booking._id, {
    currentStatus: booking.status,
    currentPaymentStatus: booking.paymentStatus,
    transactionId,
  });
  
  try {
    // Lấy customerId (có thể là ObjectId hoặc Object đã populate)
    const customerIdValue = booking.customerId?._id ?? booking.customerId;
    
    // Tạo request object giả nếu không có (cho IPN callback)
    const fakeReq = req || {
      user: customerIdValue ? { _id: customerIdValue } : null
    };

    // Giữ nguyên status hiện tại, không tự động chuyển từ pending sang confirmed
    // Chỉ cập nhật paymentStatus = paid
    console.log("🔄 updatePaymentSuccess - Keeping status unchanged:", booking.status);
    console.log("💰 updatePaymentSuccess - Updating payment status to: paid");
    
    // Set $locals để pre-save hook có thể sử dụng
    booking.$locals = booking.$locals || {};
    booking.$locals.actorId = customerIdValue ?? null;
    booking.$locals.statusAction = "payment_success";
    booking.$locals.statusNote = `VNPay thanh toán thành công. Mã giao dịch: ${transactionId || "N/A"}`;
    
    // Cập nhật payment info - KHÔNG thay đổi status
    booking.paymentStatus = "paid";
    booking.depositMethod = "vnpay";
    booking.depositStatus = booking.depositRequired ? "paid" : booking.depositStatus;
    booking.depositTxnId = transactionId || booking.depositTxnId;
    
    // Manually thêm vào statusHistory để tracking thanh toán thành công
    // Status vẫn giữ nguyên (pending), chỉ ghi lại sự kiện thanh toán
    booking.appendStatusHistory({
      status: booking.status, // Giữ nguyên status hiện tại
      action: "payment_success",
      note: `VNPay thanh toán thành công. Mã giao dịch: ${transactionId || "N/A"}`,
      userId: customerIdValue ?? null,
    });
    
    await booking.save();
    console.log("✅ updatePaymentSuccess - Booking saved with payment info updated, status unchanged:", booking.status);
    
    // Reload booking để đảm bảo có dữ liệu mới nhất
    // Luôn populate lại để đảm bảo có dữ liệu đầy đủ (safe operation)
    try {
      await booking.populate([
        { path: "customerId", select: "name phone email username" },
        { path: "courtId", select: "name code type basePrice peakPrice images" },
      ]);
    } catch (populateError) {
      console.warn("⚠️ updatePaymentSuccess - Populate warning (non-critical):", populateError?.message);
      // Không throw lỗi vì populate là optional, booking đã được cập nhật thành công
    }
    
    console.log("✅ updatePaymentSuccess - Final status:", {
      id: booking._id.toString(),
      code: booking.code,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      depositTxnId: booking.depositTxnId,
    });
  } catch (error) {
    console.error("❌ updatePaymentSuccess - Error during update:", error);
    console.error("❌ updatePaymentSuccess - Error stack:", error?.stack);
    throw error;
  }
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
    
    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({ message: "Số tiền thanh toán phải lớn hơn 0" });
    }

    // Format date theo chuẩn VNPay: yyyyMMddHHmmss (GMT+7)
    const now = new Date();
    const createDate = formatVnpDate(now);
    const expireDate = formatVnpDate(new Date(now.getTime() + 15 * 60 * 1000)); // 15 phút sau

    // Lấy IP khách hàng (không được null)
    const clientIp = getClientIp(req);
    if (!clientIp || clientIp === "127.0.0.1") {
      console.warn("⚠️ VNPay - Client IP not detected, using default");
    }

    // Mã đơn hàng - loại bỏ ký tự đặc biệt nếu có (chỉ giữ chữ và số)
    const txnRef = booking.code.replace(/[^a-zA-Z0-9]/g, "");
    
    // Mô tả đơn hàng - chỉ dùng chữ cái và số (không có ký tự đặc biệt, không có dấu)
    // VNPay yêu cầu: chỉ chữ cái, số, space (max 255 chars)
    const orderInfo = `Thanh toan don dat san ${booking.code}`.replace(/[^a-zA-Z0-9\s]/g, "").substring(0, 255);
    
    // Xây dựng các tham số theo đúng API VNPay (tên tham số phân biệt chữ hoa/thường)
    let vnpParams = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: VNPAY_TMN_CODE,
      vnp_Locale: "vn",
      vnp_CurrCode: "VND",
      vnp_TxnRef: txnRef, // Mã đơn hàng duy nhất (không có ký tự đặc biệt)
      vnp_OrderInfo: orderInfo, // Mô tả đơn hàng (không có ký tự đặc biệt, max 255 chars)
      vnp_OrderType: "other", // Loại đơn hàng
      vnp_Amount: Math.round(amount * 100), // Số tiền (PHẢI nhân 100, không có dấu phẩy)
      vnp_ReturnUrl: VNPAY_RETURN_URL, // URL callback khi thanh toán xong
      vnp_IpNUrl: VNPAY_IPN_URL, // URL để VNPay gửi callback bất đồng bộ (quan trọng!)
      vnp_IpAddr: clientIp, // IP khách hàng (không được null)
      vnp_CreateDate: createDate, // Thời gian tạo đơn (format: yyyyMMddHHmmss, GMT+7)
      vnp_ExpireDate: expireDate, // Thời gian hết hạn (format: yyyyMMddHHmmss, GMT+7)
    };

    // Thêm bankCode nếu có (để chọn ngân hàng cụ thể)
    if (bankCode) {
      vnpParams.vnp_BankCode = bankCode;
    }

    // Sắp xếp các tham số theo thứ tự alphabet (bắt buộc cho VNPay)
    vnpParams = sortObject(vnpParams);
    
    // Tạo chuỗi query string (không encode)
    const signData = querystring.stringify(vnpParams, { encode: false });
    
    // Tạo chữ ký HMACSHA512
    const secureHash = createSecureHash(signData, VNPAY_HASH_SECRET);
    
    // Thêm chữ ký vào params
    vnpParams.vnp_SecureHash = secureHash;
    
    // Tạo URL thanh toán
    const paymentUrl = `${VNPAY_PAYMENT_URL}?${querystring.stringify(vnpParams, { encode: false })}`;
    
    console.log("🔗 VNPay Payment URL created:", {
      bookingCode: booking.code,
      amount,
      amountVnp: vnpParams.vnp_Amount,
      txnRef: vnpParams.vnp_TxnRef,
      orderInfo: vnpParams.vnp_OrderInfo,
      createDate: vnpParams.vnp_CreateDate,
      expireDate: vnpParams.vnp_ExpireDate,
      clientIp: vnpParams.vnp_IpAddr,
      returnUrl: vnpParams.vnp_ReturnUrl,
      ipnUrl: vnpParams.vnp_IpNUrl,
    });
    
    return res.json({ paymentUrl });
  } catch (error) {
    return next(error);
  }
};

const verifyVnpParams = (query) => {
  const params = { ...query };
  const secureHash = params.vnp_SecureHash;
  const secureHashType = params.vnp_SecureHashType || "SHA512";
  
  // Loại bỏ các field không tham gia tính chữ ký
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;
  
  // Sắp xếp params theo alphabet (giống như khi tạo)
  const sorted = sortObject(params);
  
  // Tạo chuỗi query string (không encode)
  const signData = querystring.stringify(sorted, { encode: false });
  
  // Tạo chữ ký để so sánh (VNPay sử dụng HMACSHA512)
  const checkSum = createSecureHash(signData, VNPAY_HASH_SECRET);
  
  const isValid = secureHash === checkSum;
  
  if (!isValid) {
    console.warn("⚠️ VNPay Signature verification failed:", {
      received: secureHash?.substring(0, 20) + "...",
      calculated: checkSum?.substring(0, 20) + "...",
      signData: signData.substring(0, 100) + "...",
    });
  }
  
  return { isValid, params };
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

    // Populate customerId để kiểm tra quyền
    const booking = await Booking.findById(bookingId).populate("customerId", "name email");
    if (!booking) {
      console.error("❌ Manual Payment - Booking not found:", bookingId);
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }

    // Kiểm tra quyền - chỉ kiểm tra nếu có user
    if (!req.user) {
      console.error("❌ Manual Payment - No user in request");
      return res.status(401).json({ message: "Bạn cần đăng nhập để xác nhận thanh toán" });
    }

    const isOwner = isBookingOwner(booking, req.user);
    const isAdmin = req.user?.role === USER_ROLES.ADMIN;
    if (!isOwner && !isAdmin) {
      console.error("❌ Manual Payment - Permission denied:", { 
        bookingId, 
        userId: req.user?._id,
        userRole: req.user?.role,
        customerId: booking.customerId?._id ?? booking.customerId,
        isOwner,
        isAdmin,
      });
      return res.status(403).json({ message: "Bạn không có quyền xác nhận thanh toán booking này" });
    }

    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ message: "Booking đã được thanh toán" });
    }

    console.log("💰 Manual Payment - Confirming payment for booking:", booking.code);
    
    // Cập nhật payment status
    try {
      await updatePaymentSuccess(booking, transactionId || `MANUAL_${Date.now()}`, req);
    } catch (updateError) {
      console.error("❌ Manual Payment - Error updating payment:", updateError);
      console.error("❌ Manual Payment - Update error stack:", updateError?.stack);
      throw updateError;
    }
    
    // Reload và populate đầy đủ để trả về
    try {
      // Reload booking từ database để có dữ liệu mới nhất
      const updatedBooking = await Booking.findById(bookingId);
      if (updatedBooking) {
        await updatedBooking.populate([
          { path: "customerId", select: "name phone email username" },
          { path: "courtId", select: "name code type basePrice peakPrice images" },
        ]);
        console.log("✅ Manual Payment - Payment confirmed successfully");
        return res.status(200).json({
          success: true,
          message: "Xác nhận thanh toán thành công",
          data: updatedBooking,
        });
      } else {
        // Fallback: sử dụng booking hiện tại nếu không reload được
        console.warn("⚠️ Manual Payment - Could not reload booking, using current");
        return res.status(200).json({
          success: true,
          message: "Xác nhận thanh toán thành công",
          data: booking,
        });
      }
    } catch (populateError) {
      console.warn("⚠️ Manual Payment - Populate error (non-critical):", populateError?.message);
      // Vẫn trả về success vì payment đã được cập nhật
      return res.status(200).json({
        success: true,
        message: "Xác nhận thanh toán thành công",
        data: booking,
      });
    }
  } catch (error) {
    console.error("❌ Manual Payment - Error:", error);
    console.error("❌ Manual Payment - Error stack:", error?.stack);
    console.error("❌ Manual Payment - Error message:", error?.message);
    
    // Trả về lỗi với format đúng
    const statusCode = error?.status || error?.statusCode || 500;
    const message = error?.message || "Có lỗi xảy ra khi xác nhận thanh toán";
    
    return res.status(statusCode).json({
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    });
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

