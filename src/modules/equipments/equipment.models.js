import mongoose from 'mongoose';
import { EQUIPMENT_MODE, EQUIPMENT_STATUS } from '../../common/constants/enums.js';

const { Schema } = mongoose;

const EquipmentSchema = new Schema(
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
        // Đơn vị: cái / bộ / chiếc / quả / lần / giờ...
        unit: {
            type: String,
            required: true,
            trim: true,
            default: 'cái',
        },
        // rent | sell | both
        mode: {
            type: String,
            enum: Object.values(EQUIPMENT_MODE),
            required: true,
        },
        // in_stock | out_of_stock | discontinued
        status: {
            type: String,
            enum: Object.values(EQUIPMENT_STATUS),
            default: EQUIPMENT_STATUS.IN_STOCK,
        },
        // Tổng số lượng nhập
        totalQuantity: {
            type: Number,
            required: true,
            min: 0,
        },
        // Số lượng còn lại khả dụng
        availableQuantity: {
            type: Number,
            required: true,
            min: 0,
        },
        // Giá thuê
        rentPrice: {
            type: Number,
            default: 0,
        },
        // Giá bán
        salePrice: {
            type: Number,
            default: 0,
        },
        description: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

EquipmentSchema.index({ code: 1 }, { unique: true });

const Equipment = mongoose.model('Equipment', EquipmentSchema);
export default Equipment;
