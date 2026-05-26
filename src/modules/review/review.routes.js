import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import { Router } from 'express';
const routerReview = Router();
import {
    createReview, getMyReviews, adminGetReviews, updateReview,
    deleteReview, getFieldsNeedReview, getReviewDetail,
    getReviewsByCourt, updateReviewStatus,
} from './review.controller.js';

routerReview.get('/need-review/:id',
    // #swagger.tags = ['Reviews']
    // #swagger.summary = 'Lấy danh sách sân cần đánh giá'
    authenticate, getFieldsNeedReview
);
routerReview.delete('/:id',
    // #swagger.tags = ['Reviews']
    // #swagger.summary = 'Xóa đánh giá'
    authenticate, deleteReview
);
routerReview.put('/:id',
    // #swagger.tags = ['Reviews']
    // #swagger.summary = 'Cập nhật đánh giá'
    authenticate, updateReview
);
routerReview.post('/',
    // #swagger.tags = ['Reviews']
    // #swagger.summary = 'Tạo đánh giá mới'
    authenticate, createReview
);
routerReview.get('/admin/list',
    // #swagger.tags = ['Reviews']
    // #swagger.summary = 'Lấy danh sách đánh giá (admin)'
    authenticate, authorize('admin'), adminGetReviews
);
routerReview.get('/my',
    // #swagger.tags = ['Reviews']
    // #swagger.summary = 'Lấy danh sách đánh giá của tôi'
    authenticate, getMyReviews
);
routerReview.get('/:id',
    // #swagger.tags = ['Reviews']
    // #swagger.summary = 'Lấy chi tiết đánh giá'
    authenticate, getReviewDetail
);
routerReview.get('/court-pulic/:courtId',
    // #swagger.tags = ['Reviews']
    // #swagger.summary = 'Lấy đánh giá công khai theo sân'
    getReviewsByCourt
);
routerReview.patch('/:id/status',
    // #swagger.tags = ['Reviews']
    // #swagger.summary = 'Cập nhật trạng thái đánh giá'
    authenticate, authorize('admin'), updateReviewStatus
);

export default routerReview;
