import { Router } from 'express';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { searchUsers, createOfflineCustomer } from './user.controller.js';
import { createCustomerSchema } from './user.schema.js';

const userRouter = Router();

// Lấy danh sách khách hàng (admin dùng để tìm khách đặt sân)
// GET /api/users?search=...
userRouter.get('/', authenticate, authorize('admin'), searchUsers);

// Tạo khách hàng mới tại quầy
// POST /api/users
userRouter.post(
    '/',
    authenticate,
    authorize('admin'),
    validBodyRequest(createCustomerSchema),
    createOfflineCustomer
);

export default userRouter;
