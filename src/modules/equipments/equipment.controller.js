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

    const list = await Equipment.find(query).sort({ createdAt: -1 });
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
