import createError from '../../utils/error.js';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import { Court, CourtAmenity } from './court.models.js';

// export const createCourt = handleAsync(async (req, res, next) => {
//     const { amenities, ...courtData } = req.body;
//     const existing = await Court.findOne({ code: courtData.code });
//     if (existing) return next(createError(400, 'Mã sân đã tồn tại!'));
//     const court = await Court.create(courtData);
//     //thêm tiện nghi nếu có
//     if (amenities && amenities.length > 0) {
//         const amenityDoc = amenities.map((name) => ({
//             courtId: court._id,
//             name: name.trim(),
//         }));
//         await CourtAmenity.insertMany(amenityDoc, { ordered: false }).catch(() => {});
//     }

//     return res.json(createResponse(true, 201, 'Tạo sân thành công!', court));
// });
export const createCourt = handleAsync(async (req, res, next) => {
    const { amenities = [], ...courtData } = req.body;

    // 1) Check trùng mã (nhanh hơn findOne)
    if (await Court.exists({ code: courtData.code })) {
        return next(createError(400, 'Mã sân đã tồn tại!'));
    }

    // 2) Tạo sân
    const court = await Court.create(courtData);

    // 3) Thêm tiện nghi (trim + lọc rỗng + dedupe) — bỏ qua E11000
    if (amenities.length) {
        const names = [...new Set(amenities.map((s) => (s ?? '').trim()).filter(Boolean))];
        if (names.length) {
            const docs = names.map((name) => ({ courtId: court._id, name }));
            try {
                await CourtAmenity.insertMany(docs, { ordered: false });
            } catch (e) {
                // chỉ nuốt lỗi trùng unique để không fail request
                if (!String(e?.message).includes('E11000')) {
                    return next(createError(400, `Lỗi tiện nghi: ${e.message}`));
                }
            }
        }
    }

    // 4) Trả về như bạn đang làm (không populate)
    return res.status(201).json(createResponse(true, 201, 'Tạo sân thành công!', court));
});

export const getListCourts = handleAsync(async (req, res, next) => {
    const { type, status, search } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (search) {
        filter.$or = [
            { code: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
        ];
    }

    const courts = await Court.find(filter).sort({ createAt: -1 });

    // Lấy amenities cho từng sân
    const courtsWithAmenities = await Promise.all(
        courts.map(async (court) => {
            const amenities = await CourtAmenity.find({ courtId: court._id }).select('name').lean();
            return {
                ...court.toObject(),
                amenities: amenities.map((a) => a.name),
            };
        })
    );

    return res.json(
        createResponse(true, 200, 'Lấy danh sách sân thành công!', {
            courts: courtsWithAmenities,
        })
    );
});

export const getDetailCourt = handleAsync(async (req, res, next) => {
    const court = await Court.findById(req.params.id);
    if (!court)
        return res.json(createResponse(true, 200, 'Lấy chi tiết sân thành công !', court, null));
    // next(createError(false, 400, 'Not found Court'));
    //lấy amenities
    const amenities = await CourtAmenity.find({ courtId: court._id }).select('name').lean();
    return res.json(
        createResponse(true, 200, 'Lấy chi tiết sân thành công', {
            ...court.toObject(),
            amenities: amenities.map((a) => a.name),
        })
    );
});
export const updateCourt = handleAsync(async (req, res, next) => {
    const { amenities, ...updateData } = req.body;
    //const court = await Court.findByIdAndUpdate(req.params.id, req.body);
    //Check mã sân xem có sự thay đổi không
    if (updateData.code) {
        const existing = await Court.findOne({
            code: updateData.code,
            _id: { $ne: req.params.id },
        });
        if (existing) return next(createError(false, 400, ' Mã sân không tồn tại !'));
    }
    const court = await Court.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
    });
    if (!court) return next(createError(404, 'Không tìm thấy sân'));
    //Upadte amenities
    if (amenities !== undefined) {
        await CourtAmenity.deleteMany({ courtId: court._id });
        if (amenities.length > 0) {
            const docsameniti = amenities.map((name) => ({
                courtId: court._id,
                name: trim(),
            }));
            await CourtAmenity.insertMany(docsameniti, { ordered: false }).catch(() => {});
        }
    }
    //lấy lại amenities
    const updateAmentity = await CourtAmenity.find({ courtId: court._id }).select('name').lean();
    return res.json(
        createResponse(true, 200, 'Cập nhật sân thành công !', {
            ...court.toObject(),
            amenities: updateAmentity.map((a) => a.name),
        })
    );
});

export const softDeleteCourt = handleAsync(async (req, res, next) => {
    //const { id } = req.params;
    // if (id) {
    //     await Court.findOneAndUpdate({
    //         id,
    //         deleteAt: new Date(),
    //     });
    //     return res.json(createResponse(true, 200, 'Ẩn sân thành công !'));
    // }
    const court = await Court.findByIdAndUpdate(req.params.id, { status: 'locked' }, { new: true });
    if (!court) next(createError(false, 404, 'Không tìm thấy sân !'));
    return res.json(createResponse(true, 200, 'Khóa sân thành công !', court));
});
export const deleteCourt = handleAsync(async (req, res, next) => {
    const court = await Court.findByIdAndDelete(req.params.id);
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));
    //Xóa amenities
    await CourtAmenity.deleteMany({ courtId: court._id });
    return res.json(createResponse(true, 200, 'Xóa sân thành công !', null));

    // next(createError(false, 400, 'Xóa sân thất bại !'));
});
