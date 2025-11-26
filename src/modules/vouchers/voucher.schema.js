import mongoose from 'mongoose';
import z from 'zod';
import { COURT_TYPES, DISCOUNT_TYPES, VOUCHER_STATUS } from '../../common/constants/enums.js';

const objectIdSchema = z
    .string()
    .trim()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: 'ID sân không hợp lệ!',
    });

export const voucherSchema = z
    .object({
        code: z
            .string({ required_error: 'Vui lòng nhập mã voucher!' })
            .trim()
            .min(3, 'Mã voucher phải có ít nhất 3 ký tự!')
            .max(30, 'Mã voucher tối đa 30 ký tự!')
            .regex(/^[A-Za-z0-9_-]+$/, 'Mã voucher chỉ gồm chữ, số, - hoặc _!'),
        description: z.string().trim().max(255, 'Mô tả tối đa 255 ký tự!').optional(),
        discountType: z.enum(Object.values(DISCOUNT_TYPES), {
            errorMap: () => ({ message: 'Loại giảm không hợp lệ!' }),
        }),
        discountValue: z.coerce
            .number({ invalid_type_error: 'Giá trị giảm phải là số!' })
            .gt(0, 'Giá trị giảm phải lớn hơn 0!'),
        maxDiscountValue: z.coerce
            .number({ invalid_type_error: 'Giá trị giảm tối đa phải là số!' })
            .gt(0, 'Giá trị giảm tối đa phải lớn hơn 0!')
            .optional(),
        minOrderValue: z.coerce
            .number({ invalid_type_error: 'Điều kiện tối thiểu đơn phải là số!' })
            .min(0, 'Điều kiện tối thiểu đơn không được âm!')
            .default(0)
            .optional(),
        totalIssued: z.coerce
            .number({ invalid_type_error: 'Số lượng phát hành phải là số!' })
            .int('Số lượng phát hành phải là số nguyên!')
            .gt(0, 'Số lượng phát hành phải lớn hơn 0!'),
        perUserLimit: z.coerce
            .number({ invalid_type_error: 'Giới hạn mỗi user phải là số!' })
            .int('Giới hạn mỗi user phải là số nguyên!')
            .gt(0, 'Giới hạn mỗi user phải lớn hơn 0!'),
        startDate: z
            .string({ required_error: 'Vui lòng nhập thời gian bắt đầu!' })
            .refine((val) => !Number.isNaN(Date.parse(val)), 'Thời gian bắt đầu không hợp lệ!'),
        endDate: z
            .string({ required_error: 'Vui lòng nhập thời gian kết thúc!' })
            .refine((val) => !Number.isNaN(Date.parse(val)), 'Thời gian kết thúc không hợp lệ!'),
        applicableCourtIds: z.array(objectIdSchema).optional(),
        applicableCourtTypes: z.array(z.enum(Object.values(COURT_TYPES))).optional(),
        applicableStartHour: z
            .coerce.number({ invalid_type_error: 'Giờ bắt đầu phải là số!' })
            .int('Giờ bắt đầu phải là số nguyên!')
            .min(0, 'Giờ bắt đầu không hợp lệ!')
            .max(23, 'Giờ bắt đầu không hợp lệ!')
            .optional(),
        applicableEndHour: z
            .coerce.number({ invalid_type_error: 'Giờ kết thúc phải là số!' })
            .int('Giờ kết thúc phải là số nguyên!')
            .min(1, 'Giờ kết thúc không hợp lệ!')
            .max(24, 'Giờ kết thúc không hợp lệ!')
            .optional(),
        status: z
            .enum(Object.values(VOUCHER_STATUS), {
                errorMap: () => ({ message: 'Trạng thái không hợp lệ!' }),
            })
            .optional(),
    })
    .superRefine((data, ctx) => {
        if (data.discountType === DISCOUNT_TYPES.PERCENT) {
            if (data.discountValue > 100) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['discountValue'],
                    message: 'Voucher giảm % không được vượt quá 100!',
                });
            }
            if (typeof data.maxDiscountValue !== 'number') {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['maxDiscountValue'],
                    message: 'Vui lòng nhập giá trị giảm tối đa cho voucher %!',
                });
            }
        }

        if (data.discountType === DISCOUNT_TYPES.AMOUNT && typeof data.maxDiscountValue === 'number') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxDiscountValue'],
                message: 'Voucher giảm theo số tiền không cần giá trị giảm tối đa!',
            });
        }

        if (data.perUserLimit > data.totalIssued) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['perUserLimit'],
                message: 'Giới hạn mỗi user không được lớn hơn số lượng phát hành!',
            });
        }

        const start = new Date(data.startDate);
        const end = new Date(data.endDate);

        if (end <= start) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['endDate'],
                message: 'Thời gian kết thúc phải sau thời gian bắt đầu!',
            });
        }

        if (
            (typeof data.applicableStartHour === 'number' && typeof data.applicableEndHour !== 'number') ||
            (typeof data.applicableStartHour !== 'number' && typeof data.applicableEndHour === 'number')
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['applicableStartHour'],
                message: 'Vui lòng nhập đầy đủ khung giờ áp dụng!',
            });
        }

        if (
            typeof data.applicableStartHour === 'number' &&
            typeof data.applicableEndHour === 'number' &&
            data.applicableEndHour <= data.applicableStartHour
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['applicableEndHour'],
                message: 'Giờ kết thúc phải lớn hơn giờ bắt đầu!',
            });
        }
    });

export default voucherSchema;

