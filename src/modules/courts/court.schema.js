import z from 'zod';

const courtSchema = z.object({
    code: z.string().min(1, 'Mã sân không được để trống'),
    name: z.string().min(1, 'Tên sân không được để trống'),
    basePrice: z
        .number({
            required_error: 'Giá cơ bản là bắt buộc',
            invalid_type_error: 'Giá cơ bản phải là số',
        })
        .min(0, 'Giá cơ bản phải lớn hơn hoặc bằng 0'),
    peakPrice: z
        .number({
            required_error: 'Giá cao điểm là bắt buộc',
            invalid_type_error: 'Giá cao điểm phải là số',
        })
        .min(0, 'Giá cao điểm phải lớn hơn hoặc bằng 0'),
});
export default courtSchema;
