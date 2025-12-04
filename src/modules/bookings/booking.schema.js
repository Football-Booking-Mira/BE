import z from 'zod';
import { PAYMENT_METHOD } from '../../common/constants/enums.js';

export const bookingSchema = z
    .object({
        courtId: z.string().min(1, 'Vui lòng chọn sân!'),
        customerId: z.string().optional(),
        date: z.string().refine((val) => !isNaN(Date.parse(val)), {
            message: 'Ngày đặt không hợp lệ!',
        }),
        startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Định dạng giờ phải là HH:mm'),
        endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Định dạng giờ phải là HH:mm'),
        paymentMethod: z.enum([PAYMENT_METHOD.VNPAY, PAYMENT_METHOD.CASH, PAYMENT_METHOD.TRANSFER], {
            required_error: 'Vui lòng chọn phương thức thanh toán!',
        }),
        //*Đơn tạo tại quầy admin sẽ gửi isOffline
        isOffline: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
        //Đánh dấu đã thu tiền lúc tạo đơn (dùng cho cọc / trả full)
        paidAtCreation: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
        note: z.string().max(500).optional(),
        customerInfo: z
            .object({
                name: z.string().trim().min(1, 'Vui lòng nhập họ và tên!'),
                phone: z
                    .string()
                    .trim()
                    .regex(/^\d{10}$/, 'Số điện thoại phải gồm đúng 10 chữ số!'),
                email: z.string().trim().email('Email không hợp lệ!'),
            })
            .optional(), // để admin tạo offline không bắt buộc gửi
        voucherCode: z
            .string()
            .trim()
            .min(3, 'Mã voucher tối thiểu 3 ký tự!')
            .max(30, 'Mã voucher tối đa 30 ký tự!')
            .regex(/^[A-Za-z0-9_-]+$/, 'Mã voucher chỉ gồm chữ, số, - hoặc _!')
            .optional(),
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
export const multiBookingSchema = z.object({
    bookings: z.array(
        bookingSchema
    ).min(1, 'Vui lòng chọn ít nhất 1 khung giờ!')
});
