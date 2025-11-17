import mongoose from 'mongoose';
import {
    BOOKING_STATUS,
    PAYMENT_METHOD,
    PAYMENT_STATUS,
    USER_ROLES,
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
            trim: true,
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
            required: true,
        },

        startTime: {
            type: String,
            required: true, // "HH:mm"
        },

        endTime: {
            type: String,
            required: true,
        },

        hours: {
            type: Number,
            required: true,
            min: 0.5,
        },

        fieldAmount: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },

        total: {
            type: Number,
            required: true,
            min: 0,
        },
        createdBy: {
            type: String,
            enum: [USER_ROLES.ADMIN, USER_ROLES.USER],
            required: true,
            default: USER_ROLES.USER,
        },

        // Trạng thái và thanh toán
        status: {
            type: String,
            enum: Object.values(BOOKING_STATUS),
            default: BOOKING_STATUS.PENDING,
        },

        paymentStatus: {
            type: String,
            enum: Object.values(PAYMENT_STATUS),
            default: PAYMENT_STATUS.UNPAID,
        },

        paymentMethod: {
            type: String,
            enum: Object.values(PAYMENT_METHOD),
            required: true,
        },

        // Mốc thời gian thực tế
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
            default: false, // Hỗ trợ xóa mềm
        },
    },
    {
        timestamps: true,
    }
);
BookingSchema.index({ courtId: 1, date: 1, startTime: 1, endTime: 1 }, { name: 'slot' });
const Booking = mongoose.model('Booking', BookingSchema);
export default Booking;
