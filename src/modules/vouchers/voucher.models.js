import mongoose from 'mongoose';
import { COURT_TYPES, DISCOUNT_TYPES, VOUCHER_STATUS } from '../../common/constants/enums.js';

const {
    Schema,
    Types: { ObjectId },
} = mongoose;

const VoucherSchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: '',
        },
        discountType: {
            type: String,
            enum: Object.values(DISCOUNT_TYPES),
            required: true,
        },
        discountValue: {
            type: Number,
            required: true,
            min: 0,
        },
        maxDiscountValue: {
            type: Number,
            min: 0,
            default: null,
        },
        minOrderValue: {
            type: Number,
            min: 0,
            default: 0,
        },
        totalIssued: {
            type: Number,
            required: true,
            min: 1,
        },
        remainingQuantity: {
            type: Number,
            required: true,
            min: 0,
        },
        perUserLimit: {
            type: Number,
            required: true,
            min: 1,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        applicableCourtIds: [
            {
                type: ObjectId,
                ref: 'Court',
            },
        ],
        applicableCourtTypes: [
            {
                type: String,
                enum: Object.values(COURT_TYPES),
            },
        ],
        timeRestrictions: {
            startHour: {
                type: Number,
                min: 0,
                max: 23,
            },
            endHour: {
                type: Number,
                min: 1,
                max: 24,
            },
        },
        status: {
            type: String,
            enum: Object.values(VOUCHER_STATUS),
            default: VOUCHER_STATUS.INACTIVE,
        },
        usageCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

VoucherSchema.pre('save', function voucherPreSave(next) {
    if (this.code) {
        this.code = this.code.trim().toUpperCase();
    }
    next();
});

const Voucher = mongoose.model('Voucher', VoucherSchema);

export default Voucher;

