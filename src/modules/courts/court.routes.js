import { Court } from './court.models.js';
import { Router } from 'express';
import {
    createCourt,
    deleteCourt,
    getDetailCourt,
    getListCourts,
    softDeleteCourt,
    updateCourt,
    updateCourtMaintenance,
} from './court.controller.js';
import validBodyrequest from '../../common/middlewares/validBodyRequest.js';
import { courtSchema, updateCourtSchema } from './court.schema.js';
import upload from '../../common/middlewares/upload.middleware.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import { USER_ROLES } from '../../common/constants/enums.js';

const routesCourt = Router();

routesCourt.get('/',
    // #swagger.tags = ['Courts']
    // #swagger.summary = 'Lấy danh sách tất cả sân bóng'
    getListCourts
);

// Tìm kiếm sân theo tên hoặc giá tiền
routesCourt.get('/search', async (req, res) => {
    // #swagger.tags = ['Courts']
    // #swagger.summary = 'Tìm kiếm sân theo tên hoặc giá'
    try {
        const { name, minPrice, maxPrice } = req.query;

        // Tạo điều kiện lọc
        const filter = {};
        if (name && typeof name === 'string') {
            const cleanName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Sanitize regex input
            filter.name = { $regex: cleanName, $options: 'i' };
        }
        if (minPrice || maxPrice) {
            filter.basePrice = {};
            if (minPrice && !isNaN(Number(minPrice))) filter.basePrice.$gte = Number(minPrice);
            if (maxPrice && !isNaN(Number(maxPrice))) filter.basePrice.$lte = Number(maxPrice);
        }

        const courts = await Court.find(filter);
        res.json({ success: true, data: courts });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi khi tìm kiếm sân', error: err.message });
    }
});

routesCourt.get('/:id',
    // #swagger.tags = ['Courts']
    // #swagger.summary = 'Lấy chi tiết sân theo ID'
    getDetailCourt
);

// Protected Admin Mutation Routes
routesCourt.delete('/:id',
    // #swagger.tags = ['Courts']
    // #swagger.summary = 'Xóa sân theo ID'
    authenticate, authorize(USER_ROLES.ADMIN),
    deleteCourt
);

routesCourt.delete('/soft-delete/:id',
    // #swagger.tags = ['Courts']
    // #swagger.summary = 'Xóa mềm sân theo ID'
    authenticate, authorize(USER_ROLES.ADMIN),
    softDeleteCourt
);

routesCourt.post('/',
    // #swagger.tags = ['Courts']
    // #swagger.summary = 'Tạo sân mới'
    authenticate, authorize(USER_ROLES.ADMIN),
    upload.array('images', 10),
    validBodyrequest(courtSchema),
    createCourt
);

routesCourt.patch('/:id',
    // #swagger.tags = ['Courts']
    // #swagger.summary = 'Cập nhật thông tin sân'
    authenticate, authorize(USER_ROLES.ADMIN),
    upload.array('images', 10),
    validBodyrequest(updateCourtSchema),
    updateCourt
);

// Bảo trì
routesCourt.patch('/maintenance/:id',
    // #swagger.tags = ['Courts']
    // #swagger.summary = 'Cập nhật trạng thái bảo trì sân'
    authenticate, authorize(USER_ROLES.ADMIN),
    updateCourtMaintenance
);

export default routesCourt;
