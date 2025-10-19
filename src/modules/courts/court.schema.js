import z from 'zod';
const courtSchema = z.object({
    code: z.string().min(1, 'Mã sân không được để trống'),
    name: z.string().min(1, 'Tên sân không được để trống'),
    type: z
        .enum(['indoor', 'outdoor', 'vip'], {
            required_error: 'Loại sân là bắt buộc',
            invalid_type_error: 'Loại sân không hợp lệ',
        })
        .default('indoor'),
    status: z
        .enum(['active', 'maintenance', 'locked'], {
            required_error: 'Trạng thái là bắt buộc',
            invalid_type_error: 'Trạng thái không hợp lệ',
        })
        .default('active'),
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
    formats: z.string().optional(),
    description: z.string().optional(),
    images: z.array(z.string().url('URL ảnh không hợp lệ')).optional(),
    amenities: z.array(z.string()).optional(),
});

const updateCourtSchema = z.object({
    code: z.string().min(1, 'Mã sân không được để trống').optional(),
    name: z.string().min(1, 'Tên sân không được để trống').optional(),
    type: z.enum(['indoor', 'outdoor', 'vip']).optional(),
    status: z.enum(['active', 'maintenance', 'locked']).optional(),
    basePrice: z.number().min(0, 'Giá cơ bản phải lớn hơn hoặc bằng 0').optional(),
    peakPrice: z.number().min(0, 'Giá cao điểm phải lớn hơn hoặc bằng 0').optional(),
    formats: z.string().optional(),
    description: z.string().optional(),
    amenities: z.array(z.string()).optional(),
});

export { courtSchema, updateCourtSchema };
