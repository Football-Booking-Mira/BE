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


const routesCourt = Router();

routesCourt.get('/', getListCourts);
// Tìm kiếm sân theo tên hoặc giá tiền
routesCourt.get('/search', async (req, res) => {
    try {
        const { name, minPrice, maxPrice } = req.query;

        // Tạo điều kiện lọc
        const filter = {};
        if (name) filter.name = { $regex: name, $options: 'i' }; // tìm gần đúng (không phân biệt hoa thường)
        if (minPrice || maxPrice) {
            filter.basePrice = {};
            if (minPrice) filter.basePrice.$gte = Number(minPrice);
            if (maxPrice) filter.basePrice.$lte = Number(maxPrice);
        }

        const courts = await Court.find(filter);
        res.json({ success: true, data: courts });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi khi tìm kiếm sân', error: err.message });
    }
});

routesCourt.get('/:id', getDetailCourt);
routesCourt.delete('/:id', deleteCourt);
routesCourt.delete('/soft-delete/:id', softDeleteCourt);

routesCourt.post('/', upload.array('images', 10), validBodyrequest(courtSchema), createCourt);
routesCourt.patch(
    '/:id',
    upload.array('images', 10),
    validBodyrequest(updateCourtSchema),
    updateCourt
);

// Bảo trì
routesCourt.patch('/maintenance/:id', updateCourtMaintenance);

export default routesCourt;
