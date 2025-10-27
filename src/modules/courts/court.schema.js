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
        .string()
        .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'Giá cơ bản phải là số >= 0')
        .transform((val) => Number(val)),
    peakPrice: z
        .string()
        .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'Giá cao điểm phải là số >= 0')
        .transform((val) => Number(val)),
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
    basePrice: z
        .string()
        .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'Giá cơ bản phải là số >= 0')
        .transform((val) => Number(val)),
    peakPrice: z
        .string()
        .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'Giá cao điểm phải là số >= 0')
        .transform((val) => Number(val)),
    formats: z.string().optional(),
    description: z.string().optional(),
    amenities: z.array(z.string()).optional(),
});

export { courtSchema, updateCourtSchema };
