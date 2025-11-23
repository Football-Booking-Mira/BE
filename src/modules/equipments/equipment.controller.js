import handleAsync from '../../utils/handleAsync.js';
import createError from '../../utils/error.js';
import createResponse from '../../utils/responses.js';
import Equipment from './equipment.models.js';

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
    } = req.body; // đã được Zod parse sẵn

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
        totalQuantity,
        availableQuantity,
        rentPrice: Number(rentPrice) || 0,
        salePrice: Number(salePrice) || 0,
        description,
    });

    return res.status(201).json(createResponse(true, 201, 'Tạo thiết bị thành công!', doc));
});

// Lấy danh sách thiết bị
export const getEquipments = handleAsync(async (req, res) => {
    const { q } = req.query;
    const query = {};

    if (q) {
        query.$or = [{ code: new RegExp(q, 'i') }, { name: new RegExp(q, 'i') }];
    }

    const list = await Equipment.find(query).sort({ createdAt: -1 });
    return res.json(createResponse(true, 200, 'Lấy danh sách thiết bị thành công!', list));
});

// Chi tiết 1 thiết bị
export const getEquipmentDetail = handleAsync(async (req, res, next) => {
    const doc = await Equipment.findById(req.params.id);
    if (!doc) return next(createError(404, 'Không tìm thấy thiết bị!'));

    return res.json(createResponse(true, 200, 'Lấy chi tiết thiết bị thành công!', doc));
});

// Cập nhật
export const updateEquipment = handleAsync(async (req, res, next) => {
    const doc = await Equipment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return next(createError(404, 'Không tìm thấy thiết bị!'));

    return res.json(createResponse(true, 200, 'Cập nhật thiết bị thành công!', doc));
});

// Xóa
export const deleteEquipment = handleAsync(async (req, res, next) => {
    const doc = await Equipment.findByIdAndDelete(req.params.id);
    if (!doc) return next(createError(404, 'Không tìm thấy thiết bị!'));

    return res.json(createResponse(true, 200, 'Xóa thiết bị thành công!', null));
});
