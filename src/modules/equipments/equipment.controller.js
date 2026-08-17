import handleAsync from '../../utils/handleAsync.js';
import createError from '../../utils/error.js';
import createResponse from '../../utils/responses.js';
import Equipment from './equipment.models.js';
import { isValidObjectId, sanitizeRegex } from '../../utils/validation.utils.js';

// Tạo thiết bị
export const createEquipment = handleAsync(async (req, res, next) => {
    const {
        code,
        name,
        unit,
        mode,
        status,
        totalQuantity,
        availableQuantity,
        rentPrice,
        salePrice,
        description,
        image,
    } = req.body;

    if (!code || !name || !unit || !mode) {
        return next(createError(400, 'Thiếu dữ liệu bắt buộc!'));
    }

    const exist = await Equipment.findOne({ code });
    if (exist) return next(createError(400, 'Mã thiết bị đã tồn tại!'));

    const doc = await Equipment.create({
        code,
        name,
        unit,
        mode,
        status,
        totalQuantity: Math.max(0, Number(totalQuantity) || 0),
        availableQuantity: Math.max(0, Number(availableQuantity) || 0),
        rentPrice: Math.max(0, Number(rentPrice) || 0),
        salePrice: Math.max(0, Number(salePrice) || 0),
        description: description ? String(description).trim() : '',
        image: image || '',
    });

    return res.status(201).json(createResponse(true, 201, 'Tạo thiết bị thành công!', doc));
});

// Lấy danh sách thiết bị
export const getEquipments = handleAsync(async (req, res) => {
    const { q } = req.query;
    const query = {};

    if (q && String(q).trim() !== '') {
        const cleanQ = sanitizeRegex(String(q).trim());
        query.$or = [{ code: new RegExp(cleanQ, 'i') }, { name: new RegExp(cleanQ, 'i') }];
    }

    let list = await Equipment.find(query).sort({ createdAt: -1 });

    // Nếu DB chưa có thiết bị nào, tự động seed danh sách thiết bị mặc định vào MongoDB
    if (list.length === 0 && (!q || String(q).trim() === '')) {
        const defaultEquipments = [
            {
                code: 'G01',
                name: 'Giày đinh bóng đá FX',
                unit: 'đôi',
                mode: 'both',
                status: 'in_stock',
                totalQuantity: 1000,
                availableQuantity: 958,
                rentPrice: 30000,
                salePrice: 200000,
                description: 'Giày đinh sân cỏ nhân tạo cao cấp, đủ size từ 38 - 44',
            },
            {
                code: 'A001',
                name: 'Áo pitch phân đội',
                unit: 'cái',
                mode: 'rent',
                status: 'in_stock',
                totalQuantity: 300,
                availableQuantity: 277,
                rentPrice: 30000,
                salePrice: 0,
                description: 'Áo bib lưới tập luyện xanh, đỏ, cam, vàng thoáng khí',
            },
            {
                code: 'B01',
                name: 'Bóng đá chuẩn FIFA 5',
                unit: 'quả',
                mode: 'both',
                status: 'in_stock',
                totalQuantity: 100,
                availableQuantity: 65,
                rentPrice: 30000,
                salePrice: 300000,
                description: 'Bóng đạt chuẩn thi đấu, da PU cao cấp êm ái',
            },
            {
                code: 'GT01',
                name: 'Găng tay thủ môn có xương',
                unit: 'đôi',
                mode: 'both',
                status: 'in_stock',
                totalQuantity: 50,
                availableQuantity: 42,
                rentPrice: 30000,
                salePrice: 250000,
                description: 'Găng tay thủ môn chuyên nghiệp dính bám chống lật ngón',
            },
            {
                code: 'BG01',
                name: 'Băng thun bảo vệ gối',
                unit: 'chiếc',
                mode: 'sell',
                status: 'in_stock',
                totalQuantity: 200,
                availableQuantity: 180,
                rentPrice: 0,
                salePrice: 50000,
                description: 'Băng gối thể thao co giãn 4 chiều hỗ trợ cơ khớp',
            },
            {
                code: 'XGD01',
                name: 'Bình xịt lạnh giảm đau chấn thương',
                unit: 'chai',
                mode: 'sell',
                status: 'in_stock',
                totalQuantity: 80,
                availableQuantity: 4,
                rentPrice: 0,
                salePrice: 120000,
                description: 'Bình xịt lạnh tức thì giảm sưng đau cho cầu thủ',
            },
        ];
        try {
            list = await Equipment.insertMany(defaultEquipments);
        } catch (e) {
            console.error('Lỗi seed thiết bị:', e);
        }
    }

    return res.json(createResponse(true, 200, 'Lấy danh sách thiết bị thành công!', list));
});


// Chi tiết 1 thiết bị
export const getEquipmentDetail = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return next(createError(400, 'ID thiết bị không hợp lệ!'));
    }

    const doc = await Equipment.findById(id);
    if (!doc) return next(createError(404, 'Không tìm thấy thiết bị!'));

    return res.json(createResponse(true, 200, 'Lấy chi tiết thiết bị thành công!', doc));
});

// Cập nhật thiết bị (allowlist fields to prevent mass assignment)
export const updateEquipment = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return next(createError(400, 'ID thiết bị không hợp lệ!'));
    }

    const allowedFields = [
        'code',
        'name',
        'unit',
        'mode',
        'status',
        'totalQuantity',
        'availableQuantity',
        'rentPrice',
        'salePrice',
        'description',
        'image',
    ];

    const updateData = {};
    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
        }
    }

    const doc = await Equipment.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!doc) return next(createError(404, 'Không tìm thấy thiết bị!'));

    return res.json(createResponse(true, 200, 'Cập nhật thiết bị thành công!', doc));
});

// Xóa
export const deleteEquipment = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return next(createError(400, 'ID thiết bị không hợp lệ!'));
    }

    const doc = await Equipment.findByIdAndDelete(id);
    if (!doc) return next(createError(404, 'Không tìm thấy thiết bị!'));

    return res.json(createResponse(true, 200, 'Xóa thiết bị thành công!', null));
});
