import { file } from 'zod';
import createError from '../../utils/error.js';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import { Court, CourtAmenity } from './court.models.js';
import { v2 as cloudinary } from 'cloudinary';
import {
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
} from '../../common/config/environment.js';

cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
});

export const createCourt = handleAsync(async (req, res, next) => {
    let amenities = [];
    const courtData = { ...req.body };

    // Gom amenities từ form-data
    const amenityKeys = Object.keys(req.body).filter((key) => key.startsWith('amenities['));
    if (amenityKeys.length > 0) {
        amenities = amenityKeys.map((key) => req.body[key]).filter(Boolean);
    } else if (Array.isArray(req.body.amenities)) {
        amenities = req.body.amenities;
    }

    // Kiểm tra mã sân trùng
    if (await Court.exists({ code: courtData.code })) {
        return next(createError(400, 'Mã sân đã tồn tại!'));
    }

    // Upload ảnh song song lên Cloudinary
    if (req.files && req.files.length > 0) {
        const uploadResults = await Promise.all(
            req.files.map((file) =>
                cloudinary.uploader.upload(file.path, {
                    folder: 'courts',
                    resource_type: 'image',
                })
            )
        );
        courtData.images = uploadResults.map((r) => r.secure_url);
    }

    // Tạo sân
    const court = await Court.create(courtData);

    // Thêm tiện nghi
    if (amenities.length > 0) {
        const names = [...new Set(amenities.map((a) => a.trim()).filter(Boolean))];
        const docs = names.map((name) => ({ courtId: court._id, name }));
        try {
            await CourtAmenity.insertMany(docs, { ordered: false });
        } catch (e) {
            if (!String(e?.message).includes('E11000')) {
                return next(createError(400, `Lỗi tiện nghi: ${e.message}`));
            }
        }
    }

    // Lấy lại tiện nghi để trả về
    const amenitiesList = await CourtAmenity.find({ courtId: court._id }).select('name').lean();

    return res.status(201).json(
        createResponse(true, 201, 'Tạo sân thành công!', {
            ...court.toObject(),
            amenities: amenitiesList.map((a) => a.name),
        })
    );
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

    // Lấy danh sách sân
    const courts = await Court.find(filter).sort({ createdAt: -1 }).lean();

    // Gắn amenities vào từng sân
    const courtsWithAmenities = await Promise.all(
        courts.map(async (court) => {
            const amenities = await CourtAmenity.find({ courtId: court._id })
                .select('name -_id')
                .lean();
            return {
                ...court,
                amenities: amenities.map((a) => a.name),
            };
        })
    );

    return res.json(
        createResponse(true, 200, 'Lấy danh sách sân thành công!', courtsWithAmenities)
    );
});

export const getDetailCourt = handleAsync(async (req, res, next) => {
    const court = await Court.findById(req.params.id);
    if (!court) return next(createError(false, 400, 'Không tìm thấy sân'));

    //lấy amenities
    const amenities = await CourtAmenity.find({ courtId: court._id }).select('name').lean();
    return res.json(
        createResponse(true, 200, 'Lấy chi tiết sân thành công', {
            ...court.toObject(),
            amenities: amenities.map((a) => a.name),
        })
    );
});
// export const updateCourt = handleAsync(async (req, res, next) => {
//     let { amenities = [], ...updateData } = req.body;
//     //const court = await Court.findByIdAndUpdate(req.params.id, req.body);

//     //Gom các key amenities[0], amenities[1]
//     const amenityKeys = Object.keys(req.body).filter((key) => key.startsWith('amenities['));
//     if (amenityKeys.length > 0) {
//         amenities = amenityKeys.map((key) => req.body[key]).filter(Boolean);
//     }
//     //Cập nhật ảnh
//     if (req.files && req.files.length > 0) {
//         const courtOld = await Court.findById(req.params.id);
//         if (courtOld && courtOld.images && courtOld.images.length > 0) {
//             for (const url of courtOld.images) {
//                 // Lấy public_id trong URL Cloudinary
//                 const parts = url.split('/');
//                 const filename = parts[parts.length - 1].split('.')[0];
//                 await cloudinary.uploader.destroy(`courts/${filename}`).catch(() => {});
//             }
//         }

//         // Thay bằng ảnh mới
//         updateData.images = req.files.map((file) => file.path || file.secure_url).filter(Boolean);
//     }
//     //Check mã sân xem có sự thay đổi không
//     if (updateData.code) {
//         const existing = await Court.findOne({
//             code: updateData.code,
//             _id: { $ne: req.params.id },
//         });
//         if (existing) return next(createError(false, 400, ' Mã sân không tồn tại !'));
//     }
//     const court = await Court.findByIdAndUpdate(req.params.id, updateData, {
//         new: true,
//         runValidators: true,
//     });
//     if (!court) return next(createError(404, 'Không tìm thấy sân'));
//     //Upadte amenities
//     if (amenities !== undefined) {
//         await CourtAmenity.deleteMany({ courtId: court._id });
//         if (amenities.length > 0) {
//             const docsameniti = amenities.map((name) => ({
//                 courtId: court._id,
//                 name: String(name).trim(),
//             }));
//             await CourtAmenity.insertMany(docsameniti, { ordered: false }).catch(() => {});
//         }
//     }
//     //lấy lại amenities
//     const updateAmentity = await CourtAmenity.find({ courtId: court._id }).select('name').lean();
//     return res.json(
//         createResponse(true, 200, 'Cập nhật sân thành công !', {
//             ...court.toObject(),
//             amenities: updateAmentity.map((a) => a.name),
//         })
//     );
// });
// export const updateCourt = handleAsync(async (req, res, next) => {
//     let { amenities = [], ...updateData } = req.body;

//     // Gom amenities từ form-data
//     const amenityKeys = Object.keys(req.body).filter((k) => k.startsWith('amenities['));
//     if (amenityKeys.length > 0) {
//         amenities = amenityKeys.map((k) => req.body[k]).filter(Boolean);
//     } else if (typeof req.body.amenities === 'string') {
//         amenities = [req.body.amenities];
//     } else if (Array.isArray(req.body.amenities)) {
//         amenities = req.body.amenities;
//     }

//     // Ảnh mới: xóa ảnh cũ trên Cloudinary rồi thay
//     if (req.files && req.files.length > 0) {
//         const courtOld = await Court.findById(req.params.id);
//         if (courtOld?.images?.length) {
//             for (const url of courtOld.images) {
//                 const parts = url.split('/');
//                 const filename = parts[parts.length - 1].split('.')[0];
//                 await cloudinary.uploader.destroy(`courts/${filename}`).catch(() => {});
//             }
//         }
//         updateData.images = req.files.map((f) => f.path || f.secure_url).filter(Boolean);
//     }

//     // Check mã trùng
//     if (updateData.code) {
//         const existing = await Court.findOne({
//             code: updateData.code,
//             _id: { $ne: req.params.id },
//         });
//         if (existing) return next(createError(400, 'Mã sân đã tồn tại!'));
//     }

//     const court = await Court.findByIdAndUpdate(req.params.id, updateData, {
//         new: true,
//         runValidators: true,
//     });
//     if (!court) return next(createError(404, 'Không tìm thấy sân'));

//     // Cập nhật amenities
//     await CourtAmenity.deleteMany({ courtId: court._id });
//     if (amenities?.length) {
//         const docs = [...new Set(amenities.map((a) => String(a).trim()).filter(Boolean))].map(
//             (name) => ({
//                 courtId: court._id,
//                 name,
//             })
//         );
//         await CourtAmenity.insertMany(docs, { ordered: false }).catch(() => {});
//     }

//     const amenitiesList = await CourtAmenity.find({ courtId: court._id }).select('name').lean();
//     return res.json(
//         createResponse(true, 200, 'Cập nhật sân thành công !', {
//             ...court.toObject(),
//             amenities: amenitiesList.map((a) => a.name),
//         })
//     );
// });

export const updateCourt = handleAsync(async (req, res, next) => {
    console.log('BODY:', req.body);
    console.log('📷 FILES:', req.files?.length || 0);

    // Lấy & chuẩn hoá amenities
    let { amenities = [], keepImages, ...updateData } = req.body;

    // amenities có thể là "wifi, ia" hoặc mảng chuỗi
    if (typeof amenities === 'string') {
        amenities = amenities
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean);
    } else if (Array.isArray(amenities)) {
        amenities = amenities.map((a) => String(a).trim()).filter(Boolean);
    } else {
        amenities = [];
    }

    // Ép kiểu số cho giá
    ['basePrice', 'peakPrice'].forEach((k) => {
        if (updateData[k] !== undefined && updateData[k] !== null && updateData[k] !== '') {
            updateData[k] = Number(updateData[k]);
        }
    });

    // Check trùng mã
    if (updateData.code) {
        const exists = await Court.findOne({ code: updateData.code, _id: { $ne: req.params.id } });
        if (exists) return next(createError(400, 'Mã sân đã tồn tại!'));
    }

    const courtOld = await Court.findById(req.params.id);
    if (!courtOld) return next(createError(404, 'Không tìm thấy sân'));

    //  keepImages có thể là string hoặc array
    let keepList = [];
    if (keepImages) {
        keepList = Array.isArray(keepImages) ? keepImages : [keepImages];
    }

    //  Xoá ảnh cũ không còn giữ
    const toDelete = (courtOld.images || []).filter((url) => !keepList.includes(url));
    for (const url of toDelete) {
        const parts = url.split('/');
        const filename = parts[parts.length - 1].split('.')[0];
        // nếu bạn dùng CloudinaryStorage thì public_id có thể khác; với folder 'courts' theo code createCourt:
        await cloudinary.uploader.destroy(`courts/${filename}`).catch(() => {});
    }

    //  Upload ảnh mới (nếu có)
    let newUrls = [];
    if (req.files?.length) {
        const uploaded = await Promise.all(
            req.files.map((f) =>
                cloudinary.uploader.upload(f.path, {
                    folder: 'courts',
                    resource_type: 'image',
                })
            )
        );
        newUrls = uploaded.map((r) => r.secure_url);
    }

    //  Gộp danh sách ảnh cuối cùng
    updateData.images = [...keepList, ...newUrls];

    //  Cập nhật Court
    const court = await Court.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
    });

    //  Cập nhật tiện nghi
    await CourtAmenity.deleteMany({ courtId: court._id });
    if (amenities.length) {
        const docs = [...new Set(amenities)]
            .map((name) => ({ courtId: court._id, name }))
            .filter((d) => d.name);
        await CourtAmenity.insertMany(docs, { ordered: false }).catch(() => {});
    }

    const amenList = await CourtAmenity.find({ courtId: court._id }).select('name').lean();

    return res.json(
        createResponse(true, 200, 'Cập nhật sân thành công!', {
            ...court.toObject(),
            amenities: amenList.map((a) => a.name),
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
//bảo trì
export const updateCourtMaintenance = handleAsync(async (req, res, next) => {
    const court = await Court.findByIdAndUpdate(
        req.params.id,
        { status: 'maintenance' },
        { new: true }
    );
    if (!court) return next(createError(404, 'Không tìm thấy sân!'));
    return res.json(createResponse(true, 200, 'Đã chuyển sân sang trạng thái bảo trì!', court));
});
