import z from 'zod';
import { PAYMENT_METHOD } from '../../common/constants/enums.js';

export const bookingSchema = z
    .object({
        courtId: z.string().min(1, 'Vui lòng chọn sân!'),
        customerId: z.string().optional(),
        date: z
            .string()
            .refine((val) => !isNaN(Date.parse(val)), { message: 'Ngày đặt không hợp lệ!' }),
        startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Định dạng giờ phải là HH:mm'),
        endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Định dạng giờ phải là HH:mm'),
        paymentMethod: z.enum([PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.CASH], {
            required_error: 'Vui lòng chọn phương thức thanh toán!',
        }),
        note: z.string().max(500).optional(),
    })
    .superRefine((data, ctx) => {
        const [sh, sm] = data.startTime.split(':').map(Number);
        const [eh, em] = data.endTime.split(':').map(Number);
        const start = sh * 60 + sm;
        const end = eh * 60 + em;
        if (end <= start) {
            ctx.addIssue({
                path: ['endTime'],
                message: 'Giờ kết thúc phải sau giờ bắt đầu!',
                code: z.ZodIssueCode.custom,
            });
        }
    });
