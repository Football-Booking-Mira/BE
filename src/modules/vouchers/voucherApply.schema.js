import mongoose from 'mongoose';
import z from 'zod';

const objectIdSchema = z
    .string()
    .trim()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: 'ID sân không hợp lệ!',
    });

export const voucherApplySchema = z.object({
    code: z
        .string({ required_error: 'Vui lòng nhập mã voucher!' })
        .trim()
        .min(3, 'Mã voucher tối thiểu 3 ký tự!')
        .max(30, 'Mã voucher tối đa 30 ký tự!')
        .regex(/^[A-Za-z0-9_-]+$/, 'Mã voucher chỉ gồm chữ, số, - hoặc _!'),
    orderTotal: z.coerce
        .number({ invalid_type_error: 'Tổng tiền đơn phải là số!' })
        .gt(0, 'Tổng tiền đơn phải lớn hơn 0!'),
    courtId: objectIdSchema,
    bookingDate: z
        .string()
        .refine((val) => !Number.isNaN(Date.parse(val)), 'Ngày đặt không hợp lệ!')
        .optional(),
    startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Giờ bắt đầu không hợp lệ!')
        .optional(),
    // Giá trị giảm mà FE đã hiển thị cho khách tại thời điểm chọn voucher.
    // Dùng để phát hiện trường hợp admin đã chỉnh sửa voucher sau đó.
    expectedDiscountValue: z
        .number({ invalid_type_error: 'Giá trị giảm (client) phải là số!' })
        .optional(),
});

export default voucherApplySchema;




