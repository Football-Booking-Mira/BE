import mongoose from 'mongoose';

const {
    Schema,
    Types: { ObjectId },
} = mongoose;

const BookingItemSchema = new Schema(
    {
        bookingId: {
            type: ObjectId,
            ref: 'Booking',
            required: true,
        },
        equipmentId: {
            type: ObjectId,
            ref: 'Equipment',
            required: true,
        },
        mode: {
            type: String,
            enum: ['rent', 'sell'],
            required: true,
        },
        qty: {
            type: Number,
            required: true,
        },
        price: {
            type: Number,
            required: true, // đơn giá tại thời điểm dùng
        },
        subtotal: {
            type: Number,
            required: true, // qty * price
        },
    },
    {
        timestamps: true,
    }
);

BookingItemSchema.index({ bookingId: 1 });

const BookingItem = mongoose.model('BookingItem', BookingItemSchema);

export default BookingItem;
