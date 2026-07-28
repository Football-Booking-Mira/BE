import { Router } from 'express';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { searchUsers, createOfflineCustomer, registerOnlineUser, getUserDetail, updateUser, deleteUser, blockUser, unlockUser } from './user.controller.js';
import { createCustomerSchema, registerOnlineSchema } from './user.schema.js';

const userRouter = Router();
userRouter.get('/',
    // #swagger.tags = ['Users']
    // #swagger.summary = 'Tìm kiếm người dùng'
    authenticate, authorize('admin'), searchUsers
);
userRouter.post('/',
    // #swagger.tags = ['Users']
    // #swagger.summary = 'Tạo khách hàng offline'
    authenticate, authorize('admin'), validBodyRequest(createCustomerSchema), createOfflineCustomer
);
userRouter.post('/sign-up',
    // #swagger.tags = ['Users']
    // #swagger.summary = 'Đăng ký tài khoản người dùng'
    validBodyRequest(registerOnlineSchema), registerOnlineUser
);
userRouter.get('/:id',
    // #swagger.tags = ['Users']
    // #swagger.summary = 'Lấy chi tiết người dùng'
    authenticate, getUserDetail
);
userRouter.put('/:id',
    // #swagger.tags = ['Users']
    // #swagger.summary = 'Cập nhật thông tin người dùng'
    authenticate, updateUser
);
userRouter.delete('/:id',
    // #swagger.tags = ['Users']
    // #swagger.summary = 'Xóa người dùng'
    authenticate, deleteUser
);
userRouter.patch('/:id/block',
    // #swagger.tags = ['Users']
    // #swagger.summary = 'Khóa tài khoản người dùng'
    authenticate, authorize('admin'), blockUser
);
userRouter.patch('/:id/unlock',
    // #swagger.tags = ['Users']
    // #swagger.summary = 'Mở khóa tài khoản người dùng'
    authenticate, authorize('admin'), unlockUser
);

export default userRouter;
