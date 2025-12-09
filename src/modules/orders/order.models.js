// modules/orders/order.models.js
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

        // đổi từ userId -> customerId cho giống Booking
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

        // đổi từ totalPrice -> total (hoặc ngược lại, miễn là đồng nhất)
        total: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
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
    {
        timestamps: true,
    }
);

const Order = mongoose.model('Order', OrderSchema);
export default Order;
