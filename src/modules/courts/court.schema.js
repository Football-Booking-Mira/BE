import z from 'zod';

//Hàm convert giá sang Number
const priceNumber = z.preprocess((v) => {
    if (typeof v === 'string' && v.trim() !== '') return Number(v);
    return v;
}, z.number().min(0, 'Giá phải >= 0'));

//Dạng dữ liệu tiện nghi: có thể là chuỗi "wifi, đỗ xe" hoặc mảng
const amenitiesField = z
    .union([
        z.array(z.string().trim().min(1)),
        z.string().transform((s) =>
            s
                .split(',')
                .map((a) => a.trim())
                .filter(Boolean)
        ),
    ])
    .optional();

// Giữ ảnh cũ khi cập nhật
const keepImagesField = z.union([z.array(z.string().url()), z.string().url()]).optional();

export const courtSchema = z
    .object({
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
        basePrice: priceNumber,
        peakPrice: priceNumber,
        formats: z.string().optional(),
        description: z.string().optional(),
        images: z.array(z.string().url('URL ảnh không hợp lệ')).optional(),
        amenities: amenitiesField,
    })
    .passthrough();

export const updateCourtSchema = z
    .object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        type: z.enum(['indoor', 'outdoor', 'vip']).optional(),
        status: z.enum(['active', 'maintenance', 'locked']).optional(),
        basePrice: priceNumber.optional(),
        peakPrice: priceNumber.optional(),
        formats: z.string().optional(),
        description: z.string().optional(),
        amenities: amenitiesField,
        keepImages: keepImagesField,
    })
    .passthrough();
