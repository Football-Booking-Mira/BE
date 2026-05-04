import z from 'zod';
import { PAYMENT_METHOD } from '../../common/constants/enums.js';

const timeStringSchema = z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Định dạng giờ phải là HH:mm');

const equipmentBySlotSchema = z.record(
    z.string(),
    z.array(
        z.object({
            equipmentId: z.string(),
            mode: z.enum(['rent', 'sell']),
            qty: z.coerce.number().int().positive(), // ✅ ăn cả "2"
            // nếu FE có gửi price thì mở thêm:
            // price: z.coerce.number().nonnegative().optional(),
        })
    )
);

// nhận object hoặc JSON string
const equipmentBySlotInput = z
    .union([equipmentBySlotSchema, z.string()])
    .optional()
    .transform((val, ctx) => {
        if (typeof val !== 'string') return val;
        try {
            const parsed = JSON.parse(val);
            return equipmentBySlotSchema.parse(parsed);
        } catch {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'equipmentBySlot JSON không hợp lệ',
            });
            return z.NEVER;
        }
    });

export const bookingSchema = z
    .object({
        courtId: z.string().min(1, 'Vui lòng chọn sân!'),
        customerId: z.string().optional(),

        date: z.string().refine((val) => !isNaN(Date.parse(val)), {
            message: 'Ngày đặt không hợp lệ!',
        }),

        //  giờ tổng: optional (nếu dùng slots)
        startTime: timeStringSchema.optional(),
        endTime: timeStringSchema.optional(),

        slots: z
            .array(
                z.object({
                    startTime: timeStringSchema,
                    endTime: timeStringSchema,
                })
            )
            .min(1, 'Vui lòng chọn ít nhất 1 khung giờ!')
            .optional(),

        paymentMethod: z.enum(
            [
                PAYMENT_METHOD.VNPAY,
                PAYMENT_METHOD.MOMO,
                PAYMENT_METHOD.CASH,
                PAYMENT_METHOD.TRANSFER,
                PAYMENT_METHOD.ZALOPAY,
            ],
            { required_error: 'Vui lòng chọn phương thức thanh toán!' }
        ),

        isOffline: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
        paidAtCreation: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),

        note: z.string().max(500).optional(),

        equipmentTotal: z.coerce.number().nonnegative().optional(),
        equipmentBySlot: equipmentBySlotInput,

        customerInfo: z
            .object({
                name: z.string().trim().min(1, 'Vui lòng nhập họ và tên!'),
                phone: z
                    .string()
                    .trim()
                    .regex(/^\d{10}$/, 'Số điện thoại phải gồm đúng 10 chữ số!'),
                email: z.string().trim().email('Email không hợp lệ!'),
            })
            .optional(),

        voucherCode: z
            .string()
            .trim()
            .min(3, 'Mã voucher tối thiểu 3 ký tự!')
            .max(30, 'Mã voucher tối đa 30 ký tự!')
            .regex(/^[A-Za-z0-9_-]+$/, 'Mã voucher chỉ gồm chữ, số, - hoặc _!')
            .optional(),
    })
    .superRefine((data, ctx) => {
        // nếu KHÔNG có slots => bắt buộc startTime/endTime và validate
        if (!data.slots || data.slots.length === 0) {
            if (!data.startTime) {
                ctx.addIssue({
                    path: ['startTime'],
                    code: z.ZodIssueCode.custom,
                    message: 'Thiếu giờ bắt đầu!',
                });
                return;
            }
            if (!data.endTime) {
                ctx.addIssue({
                    path: ['endTime'],
                    code: z.ZodIssueCode.custom,
                    message: 'Thiếu giờ kết thúc!',
                });
                return;
            }

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
        }
    });

export const multiBookingSchema = z.object({
    bookings: z.array(bookingSchema).min(1, 'Vui lòng chọn ít nhất 1 khung giờ!'),
});
