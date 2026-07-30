import z from 'zod';
import * as yup from 'yup';

export const createCustomerSchema = z.object({
    name: z
        .string({ message: 'Họ tên là bắt buộc!' })
        .min(2, 'Họ tên phải có ít nhất 2 ký tự')
        .max(50, 'Họ tên tối đa 50 ký tự'),
    phone: z
        .string({ message: 'Số điện thoại là bắt buộc!' })
        .regex(/^0\d{9}$/, 'Số điện thoại phải bao gồm đúng 10 chữ số (bắt đầu bằng số 0)!'),
    email: z
        .string({ message: 'Email sai định dạng!' })
        .email('Email không đúng định dạng!')
        .optional()
        .or(z.literal('')),
});

export const createCustomerOnlineSchema = yup.object({
    name: yup.string().required(),
    email: yup.string().email().required(),
    phone: yup.string().nullable(),
    password: yup.string().required().min(6),
    role: yup.string().oneOf(['user']).default('user'),
});

export const registerOnlineSchema = z.object({
    name: z.string().min(1, 'Tên không được để trống'),
    email: z.string().email('Email không hợp lệ'),
    phone: z.string().optional(),
    password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
});