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
            trim: true,
        },
        type: {
            type: String,
            enum: Object.values(COURT_TYPES),
            default: COURT_TYPES.INDOOR,
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(COURT_STATUS),
            default: COURT_STATUS.ACTIVE,
            required: true,
        },
        basePrice: {
            type: Number,
            required: true,
            min: 0,
        },
        peakPrice: {
            type: Number,
            required: true,
            min: 0,
        },
        formats: {
            type: String,
            default: '',
        },
        description: {
            type: String,
            default: '',
        },
        images: {
            type: [String],
            default: [],
        },
    },

    {
        timestamps: true,
    }
);
//filter và tìm kiếm
courtSchema.index({ code: 1 });
courtSchema.index({ status: 1, type: 1 });
const courtAmenitySchema = new mongoose.Schema(
    {
        courtId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Court',
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);
//Không được trùng
courtAmenitySchema.index({ courtId: 1, name: 1 }, { unique: true });
const Court = mongoose.model('Court', courtSchema);
const CourtAmenity = mongoose.model('CourtAmenity', courtAmenitySchema);

export { Court, CourtAmenity };
