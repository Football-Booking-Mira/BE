import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true },

    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: "" },

    status: { type: String, enum: ['active', 'hidden'], default: 'active' }, // admin có thể ẩn
}, { timestamps: true });

export default mongoose.model('Review', reviewSchema);
