import z from 'zod';

export const createCustomerSchema = z.object({
    name: z
        .string({ message: 'Họ tên là bắt buộc!' })
        .min(3, 'Họ tên phải có ít nhất 3 ký tự')
        .max(50, 'Họ tên tối đa 50 ký tự'),
    phone: z
        .string({ message: 'Số điện thoại là bắt buộc!' })
        .regex(/^0\d{6,13}$/, 'Số điện thoại phải bắt đầu bằng 0 và có từ 7 đến 14 số!'),
    // email không bắt buộc
    email: z
        .string({ message: 'Email sai định dạng!' })
        .email('Email sai định dạng!')
        .optional()
        .or(z.literal('')),
});
