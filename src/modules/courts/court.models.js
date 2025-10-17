import mongoose from 'mongoose';
import { COURT_STATUS, COURT_TYPES } from '../../common/constants/enums.js';
const courtSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            unique: true,
        },
        type: {
            type: String,
            enum: Object.values(COURT_TYPES),
            default: COURT_TYPES.INDOOR,
        },
        status: {
            type: String,
            enum: Object.values(COURT_STATUS),
            default: COURT_STATUS.ACTIVE,
        },
        basePrice: {
            type: Number,
            required: true,
        },
        peakPrice: {
            type: Number,
            required: true,
        },
        formats: {
            type: String,
        },
        description: {
            type: String,
        },
        deleteAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);
//courtSchema.index({ code: 1 }, { unique: true });
const Court = mongoose.model('Court', courtSchema);
export default Court;
