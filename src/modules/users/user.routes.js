import { Router } from 'express';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { searchUsers, createOfflineCustomer, registerOnlineUser, getUserDetail, updateUser, deleteUser, blockUser, unlockUser } from './user.controller.js';
import { createCustomerSchema, registerOnlineSchema } from './user.schema.js';

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

userRouter.post(
    '/sign-up',
    validBodyRequest(registerOnlineSchema),
    registerOnlineUser
);

userRouter.get('/:id', getUserDetail);
userRouter.put('/:id', authenticate, updateUser);
userRouter.delete(
    '/:id',
    authenticate,
    deleteUser
);

userRouter.patch('/:id/block', authenticate, authorize('admin'), blockUser);
userRouter.patch('/:id/unlock', authenticate, authorize('admin'), unlockUser);


export default userRouter;
