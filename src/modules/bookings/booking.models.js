import mongoose from 'mongoose';
import {
    BOOKING_STATUS,
    PAYMENT_METHOD,
    PAYMENT_STATUS,
    USER_ROLES,
    DEPOSIT_STATUS,
} from '../../common/constants/enums.js';

const {
    Schema,
    Types: { ObjectId },
} = mongoose;

const BookingSchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true, /// BK123456
        },

        customerId: {
            type: ObjectId,
            ref: 'User',
            default: null,
        },

        courtId: {
            type: ObjectId,
            ref: 'Court',
            required: true,
        },

        date: {
            type: Date,
            required: true, // ngày chơi
        },

        startTime: {
            type: String,
            required: true, // "HH:mm"
        },

        endTime: {
            type: String,
            required: true, // "HH:mm"
        },

        hours: {
            type: Number,
            required: true,
            min: 1, // ít nhất 1 Tiếng
        },

        customerInfo: {
            name: {
                type: String,
                trim: true,
                default: '',
            },
            phone: {
                type: String,
                trim: true,
                default: '',
            },
            email: {
                type: String,
                trim: true,
                default: '',
            },
        },

        //  Tiền sân & tổng tiền
        fieldAmount: {
            type: Number,
            required: true,
            min: 0,
            default: 0, // tiền sân (normal + peak)
        },

        equipmentTotal: {
            type: Number,
            required: true,
            min: 0,
            default: 0, // tiền thuê/mua thiết bị
        },

        discountTotal: {
            type: Number,
            required: true,
            min: 0,
            default: 0, // tổng tiền giảm (voucher, khuyến mãi)
        },

        total: {
            type: Number,
            required: true,
            min: 0, // thành tiền cuối cùng sau giảm
        },

        voucherId: {
            type: ObjectId,
            ref: 'Voucher',
            default: null,
        },

        voucherCode: {
            type: String,
            trim: true,
            uppercase: true,
            default: '',
        },

        voucherDiscount: {
            type: Number,
            min: 0,
            default: 0,
        },

        voucherSnapshot: {
            discountType: { type: String },
            discountValue: { type: Number },
            maxDiscountValue: { type: Number },
            minOrderValue: { type: Number },
            perUserLimit: { type: Number },
            startDate: { type: Date },
            endDate: { type: Date },
        },

        voucherUsageId: {
            type: ObjectId,
            ref: 'VoucherUsage',
            default: null,
        },

        voucherUsageStatus: {
            type: String,
            enum: ['none', 'pending', 'applied', 'restored', 'consumed'],
            default: 'none',
        },

        voucherRestoredAt: {
            type: Date,
            default: null,
        },

        createdBy: {
            type: String,
            enum: [USER_ROLES.ADMIN, USER_ROLES.USER],
            required: true,
            default: USER_ROLES.USER, // 'admin' | 'user'
        },

        //  Trạng thái & thanh toán
        status: {
            type: String,
            enum: Object.values(BOOKING_STATUS),
            default: BOOKING_STATUS.PENDING, // pending|confirmed|in_use|completed|cancelled|...
        },

        paymentStatus: {
            type: String,
            enum: Object.values(PAYMENT_STATUS),
            default: PAYMENT_STATUS.UNPAID, // unpaid|partial|paid|refunded
        },

        paymentMethod: {
            type: String,
            enum: Object.values(PAYMENT_METHOD), // cash|transfer|momo|vnpay|qr...
            required: true,
        },

        //  Thông tin cọc
        depositAmount: {
            type: Number,
            min: 0,
            default: 0, // số tiền đã cọc (VND)
        },

        depositStatus: {
            type: String,
            enum: Object.values(DEPOSIT_STATUS),
            default: DEPOSIT_STATUS.NONE, //none| pending|paid|refunded|forfeited
        },

        depositMethod: {
            type: String,
            enum: Object.values(PAYMENT_METHOD), // phương thức cọc (vnpay, cash,..)
            default: null
        },

        //  Mốc thời gian thực tế
        checkinAt: {
            type: Date,
            default: null,
        },

        checkoutAt: {
            type: Date,
            default: null,
        },

        notes: {
            type: String,
            default: '',
        },

        isDeleted: {
            type: Boolean,
            default: false, // xóa mềm
        },

        //  Hủy đơn
        cancelReason: {
            type: String,
            trim: true,
            default: '', // lý do hủy cho user xem
        },

        cancelBy: {
            type: String,
            enum: [USER_ROLES.ADMIN, USER_ROLES.USER],
            default: null, // 'admin' | 'user'  ai hủy
        },

        cancelNote: {
            type: String,
            trim: true,
            default: '',
        },

        cancelledAt: {
            type: Date,
            default: null,
        },

        //  Thông tin hoàn tiền user cấp
        refundAccountNumber: {
            type: String,
            trim: true,
            default: '',
        },

        refundAccountName: {
            type: String,
            trim: true,
            default: '',
        },

        refundBankName: {
            type: String,
            trim: true,
            default: '',
        },

        refundNote: {
            type: String,
            trim: true,
            default: '', // user có thể ghi chú thêm khi yêu cầu hoàn tiền
        },

        // Trạng thái xử lý hoàn tiền: none|pending|processing|refunded|rejected
        refundStatus: {
            type: String,
            enum: ['none', 'pending', 'processing', 'refunded', 'rejected'],
            default: 'none',
        },
        refundAdminReason: {
            type: String,
            trim: true,
            default: '', // lý do admin từ chối hoàn tiền
        },

        refundBillImage: {
            type: String,
            trim: true,
            default: '', // link ảnh bill/hoá đơn hoàn tiền (Cloudinary...)
        },

        refundRequestedAt: {
            type: Date,
            default: null, // lúc user gửi yêu cầu hoàn tiền
        },

        refundProcessedAt: {
            type: Date,
            default: null, // lúc admin xử lý xong (từ chối / hoàn tiền)
        },
        autoCancelAt: {
            type: Date,
            default: null,
            index: true, // để query nhanh hơn
        },
    },
    {
        timestamps: true,
    }
);

//* Lọc nhanh booking theo ngày + sân
BookingSchema.index({ date: 1, courtId: 1 }, { name: 'idx_booking_date_court' });

//*Chống trùng slot cùng sân, cùng ngày, cùng giờ
//*Chỉ áp dụng với booking KHÔNG bị hủy
BookingSchema.index(
    { courtId: 1, date: 1, startTime: 1, endTime: 1 },
    {
        name: 'uq_exact_slot',
        unique: true,
        partialFilterExpression: {
            status: { $ne: BOOKING_STATUS.CANCELLED },
        },
    }
);

//* Lọc theo khách hàng
BookingSchema.index({ customerId: 1 }, { name: 'idx_booking_customer' });

const Booking = mongoose.model('Booking', BookingSchema);
export default Booking;
