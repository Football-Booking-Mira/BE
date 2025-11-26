import mongoose from 'mongoose';

const {
    Schema,
    Types: { ObjectId },
} = mongoose;

const VoucherUsageSchema = new Schema(
    {
        voucherId: {
            type: ObjectId,
            ref: 'Voucher',
            required: true,
        },
        userId: {
            type: ObjectId,
            ref: 'User',
            required: true,
        },
        bookingId: {
            type: ObjectId,
            ref: 'Booking',
            required: true,
            unique: true,
        },
        discountAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        orderTotal: {
            type: Number,
            required: true,
            min: 0,
        },
        status: {
            type: String,
            enum: ['applied', 'restored'],
            default: 'applied',
        },
        restoredAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

VoucherUsageSchema.index({ voucherId: 1, userId: 1 });
VoucherUsageSchema.index({ voucherId: 1, status: 1 });

const VoucherUsage = mongoose.model('VoucherUsage', VoucherUsageSchema);

export default VoucherUsage;

