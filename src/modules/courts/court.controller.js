import createError from '../../utils/error.js';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import Court from './court.models.js';

export const createCourt = handleAsync(async (req, res, next) => {
    const existing = await Court.findOne({ name: req.body.name });
    if (existing) return next(createError(400, 'Sân này đã tồn tại !'));
    const court = await Court.create(req.body);
    return res.json(createResponse(true, 201, 'Tạo sân thành công !', court));
});
export const getDetailCourt = handleAsync(async (req, res, next) => {
    const court = await Court.findById(req.params.id);
    if (court) return res.json(createResponse(true, 200, 'Lấy chi tiết sân thành công !', court));
    next(createError(false, 400, 'Not found Court'));
});
export const getListCourts = handleAsync(async (req, res, next) => {
    const court = await Court.find();
    return res.json(createResponse(true, 200, 'Lấy danh sách sân thành công !', court));
});
export const updateCourt = handleAsync(async (req, res, next) => {
    const court = await Court.findByIdAndUpdate(req.params.id, req.body);
    if (court) return res.json(createResponse(true, 200, 'Cập nhật sân thành công !', court));
    next(createError(false, 400, ' Court update Failed!'));
});
export const deleteCourt = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    const court = await Court.findByIdAndDelete(id);
    if (court) return res.json(createResponse(true, 200, 'Xóa sân thành công !'));
    next(createError(false, 400, 'Xóa sân thất bại !'));
});
export const softDeleteCourt = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    if (id) {
        await Court.findOneAndUpdate({
            id,
            deleteAt: new Date(),
        });
        return res.json(createResponse(true, 200, 'Ẩn sân thành công !'));
    }
    next(createError(false, 404, 'Ẩn sân thất bại !'));
});
