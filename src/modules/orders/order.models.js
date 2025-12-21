import mongoose from 'mongoose';
import { PAYMENT_STATUS, PAYMENT_METHOD } from '../../common/constants/enums.js';

const {
    Schema,
    Types: { ObjectId },
} = mongoose;

const OrderSchema = new Schema(
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
            required: true,
        },

        bookings: [
            {
                type: ObjectId,
                ref: 'Booking',
                required: true,
            },
        ],

        voucherId: {
            type: ObjectId,
            ref: 'Voucher',
            default: null,
        },

        voucherDiscount: {
            type: Number,
            default: 0,
            min: 0,
        },

        total: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },

        paidAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        refundedAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        paymentStatus: {
            type: String,
            enum: Object.values(PAYMENT_STATUS),
            default: PAYMENT_STATUS.UNPAID,
        },

        paymentMethod: {
            type: String,
            enum: Object.values(PAYMENT_METHOD),
            default: null,
        },

        status: {
            type: String,
            enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
            default: 'PENDING',
        },
    },
    { timestamps: true }
);

// ✅ BẮT BUỘC PHẢI CÓ
const Order = mongoose.model('Order', OrderSchema);

export default Order;
