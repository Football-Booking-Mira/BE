import { z } from 'zod';
import { EQUIPMENT_MODE } from '../../common/constants/enums.js';

//* Chỉ cho phép 'rent' | 'sell'
const BOOKING_ITEM_MODE = [EQUIPMENT_MODE.RENT, EQUIPMENT_MODE.SELL];

export const bookingItemInputSchema = z.object({
    equipmentId: z.string({ required_error: 'Thiếu thiết bị' }).trim().min(1, 'Thiếu thiết bị'),
    mode: z.enum(BOOKING_ITEM_MODE, {
        errorMap: () => ({ message: 'Hình thức không hợp lệ (thuê / bán)' }),
    }),
    qty: z.coerce
        .number({ invalid_type_error: 'Số lượng phải là số' })
        .int('Số lượng phải là số nguyên')
        .min(1, 'Số lượng phải lớn hơn 0'),
    price: z.coerce
        .number({ invalid_type_error: 'Đơn giá phải là số' })
        .min(0, 'Đơn giá không được âm'),
});

// Body cho PUT /booking-items/:bookingId
export const upsertBookingItemsSchema = z.object({
    items: z.array(bookingItemInputSchema).optional().default([]), // nếu không gửi gì coi như xóa hết thiết bị
});

export default {
    bookingItemInputSchema,
    upsertBookingItemsSchema,
};
