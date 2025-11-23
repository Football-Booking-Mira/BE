// src/modules/equipments/equipment.schema.js
import { z } from 'zod';
import { EQUIPMENT_MODE, EQUIPMENT_STATUS } from '../../common/constants/enums.js';

const UNIT_OPTIONS = ['cái', 'bộ', 'chiếc', 'quả', 'lần', 'giờ', 'đôi', 'chai'];

const baseEquipmentSchema = z
    .object({
        code: z
            .string({ required_error: 'Mã thiết bị là bắt buộc' })
            .trim()
            .min(1, 'Mã thiết bị không được để trống'),
        name: z
            .string({ required_error: 'Tên thiết bị là bắt buộc' })
            .trim()
            .min(1, 'Tên thiết bị không được để trống'),
        unit: z
            .string({ required_error: 'Đơn vị là bắt buộc' })
            .trim()
            .min(1, 'Đơn vị không được để trống')
            .max(50, 'Đơn vị tối đa 50 ký tự')
            .refine((v) => !!v, { message: 'Đơn vị không được để trống' }),

        mode: z.enum(Object.values(EQUIPMENT_MODE), {
            errorMap: () => ({ message: 'Hình thức không hợp lệ' }),
        }),

        status: z
            .enum(Object.values(EQUIPMENT_STATUS), {
                errorMap: () => ({ message: 'Trạng thái không hợp lệ' }),
            })
            .optional(),

        totalQuantity: z.coerce
            .number({ invalid_type_error: 'Tổng số lượng phải là số' })
            .int('Tổng số lượng phải là số nguyên')
            .min(0, 'Tổng số lượng không được âm'),

        availableQuantity: z.coerce
            .number({ invalid_type_error: 'Số lượng còn lại phải là số' })
            .int('Số lượng còn lại phải là số nguyên')
            .min(0, 'Số lượng còn lại không được âm'),

        rentPrice: z.coerce
            .number({ invalid_type_error: 'Giá thuê phải là số' })
            .min(0, 'Giá thuê không được âm')
            .default(0),

        salePrice: z.coerce
            .number({ invalid_type_error: 'Giá bán phải là số' })
            .min(0, 'Giá bán không được âm')
            .default(0),

        description: z.string().max(2000, 'Mô tả tối đa 2000 ký tự').optional().or(z.literal('')),
    })
    .refine((data) => data.availableQuantity <= data.totalQuantity, {
        message: 'Số lượng còn lại không được lớn hơn tổng số lượng',
        path: ['availableQuantity'],
    });

export const createEquipmentSchema = baseEquipmentSchema;
export const updateEquipmentSchema = baseEquipmentSchema.partial();

export default { createEquipmentSchema, updateEquipmentSchema };
