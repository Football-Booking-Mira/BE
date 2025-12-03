import {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  DEPOSIT_STATUS,
} from '../../common/constants/enums.js';
import crypto from 'crypto';
import qs from 'qs';
import Booking from '../bookings/booking.models.js';
import {
  VNP_URL,
  VNP_TMN_CODE,
  VNP_HASH_SECRET,
  VNP_RETURN_URL,
  FRONT_END_URL,
} from '../../common/config/environment.js';
import { commitVoucherUsage, rollbackVoucherUsage } from '../vouchers/voucher.service.js';

// Tỉ lệ cọc so với TIỀN SÂN
// 1= thanh toán FULL tiền sân
const DEPOSIT_RATE = 1;

function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj)
    .map((k) => encodeURIComponent(k))
    .sort();
  for (const key of keys) {
    sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+');
  }
  return sorted;
}

// ==============================
// Tạo URL thanh toán VNPAY (tiền sân)
// ==============================
export const createVnpayPayment = async (req, res, next) => {
  try {
    const { bookingId, amount, isRetryPayment } = req.body;
    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'Thiếu bookingId' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy booking' });
    }
    //*Không cho thanh toán đơn đã tự hủy do quá hạn */
    const now = new Date();
    if (
      booking.autoCancelAt &&
      booking.autoCancelAt <= now &&
      booking.status === BOOKING_STATUS.PENDING &&
      booking.paymentStatus === PAYMENT_STATUS.UNPAID
    ) {
      booking.status = BOOKING_STATUS.CANCELLED;
      booking.cancelBy = 'system';
      booking.cancelReason = 'Hết thời gian thanh toán online (5 phút), đơn tự động hủy.';
      booking.cancelledAt = now;
      await booking.save();

      return res.status(400).json({
        success: false,
        message: 'Đơn đã hết hạn thanh toán (quá 5 phút). Vui lòng đặt sân lại.',
      });
    }
    // Không cho thanh toán đơn đã hủy
    if (booking.status === BOOKING_STATUS.CANCELLED) {
      return res
        .status(400)
        .json({ success: false, message: 'Đơn này đã bị hủy, không thể thanh toán!' });
    }

    // Tổng tiền cần thanh toán cho booking
    const total = Number(booking.total || booking.fieldAmount || 0);
    if (!total || total <= 0) {
      return res.status(400).json({ success: false, message: 'Tổng tiền không hợp lệ!' });
    }

    const oldDeposit =
      booking.depositStatus === DEPOSIT_STATUS.PAID ? Number(booking.depositAmount || 0) : 0;
    const remaining = Math.max(0, total - oldDeposit);

    if (remaining <= 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Đơn này đã thanh toán đủ tiền!' });
    }

    let payNow = 0;

    if (isRetryPayment) {
      //  THANH TOÁN LẠI: chỉ cho trả phần còn thiếu
      const clientAmount = Number(amount || 0);
      payNow = clientAmount > 0 ? Math.min(clientAmount, remaining) : remaining;
    } else {
      //  THANH TOÁN LẦN ĐẦU: tính theo tỉ lệ cọc (DEPOSIT_RATE)
      let depositAmount = Math.round(total * DEPOSIT_RATE);
      // không được vượt quá phần còn lại
      depositAmount = Math.min(depositAmount, remaining);
      payNow = depositAmount;
    }

    if (!payNow || payNow <= 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Số tiền thanh toán không hợp lệ!' });
    }

    // ⭐ COMMIT VOUCHER NGAY KHI TẠO PAYMENT URL (FIRST-COME-FIRST-SERVED)
    // Chỉ commit cho booking mới (không phải retry payment) và có voucher ở trạng thái "pending"
    if (
      !isRetryPayment &&
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
        await booking.save();
      } catch (error) {
        // ⚠️ Voucher đã hết lượt - trả về lỗi yêu cầu chọn voucher khác
        const isOutOfUsage =
          error.statusCode === 409 ||
          error.message?.includes('hết lượt') ||
          error.message?.includes('hết lượt sử dụng');

        if (isOutOfUsage) {
          return res.status(409).json({
            success: false,
            message: `Voucher "${booking.voucherCode || ''}" đã hết lượt sử dụng, vui lòng chọn voucher khác.`,
            code: 'VOUCHER_OUT_OF_STOCK',
          });
        }

        // Lỗi khác - trả về lỗi chung
        return res.status(400).json({
          success: false,
          message: error.message || 'Không thể áp dụng voucher. Vui lòng thử lại.',
        });
      }
    }

    const orderId = booking.code;
    const createDate = new Date()
      .toISOString()
      .replace(/[-T:\.Z]/g, '')
      .slice(0, 14);

    // VNPAY dùng đơn vị = VND * 100
    const vnpAmount = payNow * 100;

    const vnp_Params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: VNP_TMN_CODE,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: orderId,
      vnp_OrderInfo: `Thanh toan cho don ${orderId}`,
      vnp_OrderType: 'billpayment',
      vnp_Amount: vnpAmount,
      vnp_ReturnUrl: VNP_RETURN_URL,
      vnp_IpAddr: req.ip || '127.0.0.1',
      vnp_CreateDate: createDate,
    };

    const sorted = sortObject(vnp_Params);
    const signData = qs.stringify(sorted, { encode: false });
    const hmac = crypto.createHmac('sha512', VNP_HASH_SECRET.trim());
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    sorted.vnp_SecureHash = signed;

    const paymentUrl = `${VNP_URL}?${qs.stringify(sorted, { encode: false })}`;

    return res.json({
      success: true,
      data: { paymentUrl, payNow, remaining, total, oldDeposit },
    });
  } catch (err) {
    next(err);
  }
};

// ==============================
// VNPAY callback
// ==============================
export const vnpayReturn = async (req, res, next) => {
  try {
    let vnp_Params = { ...req.query };
    const secureHash = vnp_Params.vnp_SecureHash;

    delete vnp_Params.vnp_SecureHash;
    delete vnp_Params.vnp_SecureHashType;

    vnp_Params = sortObject(vnp_Params);

    const signData = qs.stringify(vnp_Params, { encode: false });
    const hmac = crypto.createHmac('sha512', VNP_HASH_SECRET.trim());
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    // Sai chữ ký -> trả về FE báo invalid
    if (secureHash !== signed) {
      return res.redirect(`${FRONT_END_URL}/payment-return?status=invalid`);
    }

    const rspCode = vnp_Params.vnp_ResponseCode; // '00' = thành công
    const txnRef = vnp_Params.vnp_TxnRef; // booking.code
    const amountFromVnp = Number(vnp_Params.vnp_Amount || 0); // đơn vị: VND * 100
    const paidAmount = amountFromVnp / 100; // VND thực tế

    // Tìm booking theo code
    const booking = await Booking.findOne({ code: txnRef });
    if (!booking) {
      return res.redirect(`${FRONT_END_URL}/payment-return?status=notfound`);
    }

    //  Ghi nhận tiền đã thanh toán (cộng dồn cọc + cập nhật paymentStatus)
    // Cờ theo dõi trạng thái voucher trong quá trình thanh toán
    let voucherStatus = 'none'; // none | applied | expired
    let voucherErrorMessage = '';

    if (rspCode === '00' && paidAmount > 0) {
      const oldDeposit = Number(booking.depositAmount || 0);
      const newDeposit = oldDeposit + paidAmount;

      booking.depositAmount = newDeposit;
      booking.depositMethod = PAYMENT_METHOD.VNPAY;
      booking.depositStatus = DEPOSIT_STATUS.PAID;

      const total = Number(booking.total || booking.fieldAmount || 0);

      if (total > 0 && newDeposit >= total) {
        booking.paymentStatus = PAYMENT_STATUS.PAID;
      } else if (newDeposit > 0) {
        booking.paymentStatus = PAYMENT_STATUS.PARTIAL;
      } else {
        booking.paymentStatus = PAYMENT_STATUS.UNPAID;
      }

      // Voucher đã được commit ở createVnpayPayment, không cần commit lại ở đây
      // Chỉ cập nhật status nếu cần
      if (booking.voucherUsageStatus === 'applied') {
        voucherStatus = 'applied';
      }

      await booking.save();
    } else {
      // ⚠️ THANH TOÁN THẤT BẠI - ROLLBACK VOUCHER
      // Nếu voucher đã được commit (status = 'applied'), cần rollback
      if (
        booking.voucherId &&
        booking.voucherUsageStatus === 'applied' &&
        booking.voucherUsageId &&
        booking.customerId
      ) {
        try {
          await rollbackVoucherUsage(
            booking.voucherId,
            booking.customerId,
            booking._id
          );
          booking.voucherUsageStatus = 'restored';
          booking.voucherRestoredAt = new Date();
          await booking.save();
          console.log(
            `✅ Đã rollback voucher cho booking ${booking.code} do thanh toán thất bại`
          );
        } catch (error) {
          console.error('❌ Lỗi khi rollback voucher:', error.message);
        }
      }
    }

    // Bắn socket cho FE cập nhật lịch sân
    const io = req.app.get('io');
    io?.emit('booking_global_updated');
    io?.to(String(booking.courtId)).emit('booking_updated', {
      courtId: String(booking.courtId),
      date: booking.date.toISOString().slice(0, 10),
    });

    const queryParams = {
      ...req.query,
      status: rspCode,
    };

    // Nếu voucher đã hết lượt trong quá trình thanh toán, gửi thêm trạng thái & thông báo chi tiết
    if (voucherStatus === 'expired') {
      queryParams.voucherStatus = 'expired';
      queryParams.voucherMessage =
        voucherErrorMessage ||
        'Voucher bạn chọn đã hết lượt sử dụng trong lúc thanh toán. Hệ thống đã tính lại tổng tiền không áp dụng voucher.';
    }

    const query = new URLSearchParams(queryParams).toString();

    return res.redirect(`${FRONT_END_URL}/payment-return?${query}`);
  } catch (err) {
    next(err);
  }
};