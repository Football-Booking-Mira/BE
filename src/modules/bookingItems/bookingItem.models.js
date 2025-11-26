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
        name: {
            type: String,
            required: true,
        }, // Áo pitch, Giày Adidas...
        unit: {
            type: String,
            required: true,
        }, // cái / đôi / quả / chai...
        // rent | sell
        mode: {
            type: String,
            enum: ['rent', 'sell'],
            required: true,
        },
        qty: {
            type: Number,
            required: true,
            min: 1,
        },
        price: {
            type: Number,
            required: true, // đơn giá tại thời điểm dùng/bán
            min: 0,
        },
        subtotal: {
            type: Number,
            required: true, // qty * price
            min: 0,
        },
    },
    {
        timestamps: true,
    }
);

//* Index để tìm nhanh theo booking
BookingItemSchema.index({ bookingId: 1 });

const BookingItem = mongoose.model('BookingItem', BookingItemSchema);

export default BookingItem;
