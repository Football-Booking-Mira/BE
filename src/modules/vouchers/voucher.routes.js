import { Router } from 'express';
import { USER_ROLES } from '../../common/constants/enums.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import {
    createVoucher,
    deleteVoucher,
    getPublicVouchers,
    getVoucherById,
    getVoucherStats,
    getVouchers,
    getVouchersDebug,
    updateVoucher,
    validateVoucher,
} from './voucher.controller.js';
import { voucherSchema } from './voucher.schema.js';
import { voucherApplySchema } from './voucherApply.schema.js';

const voucherRoutes = Router();

// Public route - Không cần đăng nhập
voucherRoutes.get('/public', getPublicVouchers);

// Debug route - Xem tất cả voucher để debug (tạm thời, có thể xóa sau)
voucherRoutes.get('/debug', getVouchersDebug);

// Admin routes - Cần đăng nhập và quyền ADMIN
voucherRoutes.get('/', authenticate, authorize(USER_ROLES.ADMIN), getVouchers);

voucherRoutes.post(
    '/',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    validBodyRequest(voucherSchema),
    createVoucher
);

voucherRoutes.post(
    '/validate',
    authenticate,
    validBodyRequest(voucherApplySchema),
    validateVoucher
);

voucherRoutes.get(
    '/:voucherId/stats',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    getVoucherStats
);

voucherRoutes.get(
    '/:voucherId',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    getVoucherById
);

voucherRoutes.put(
    '/:voucherId',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    validBodyRequest(voucherSchema),
    updateVoucher
);

voucherRoutes.delete(
    '/:voucherId',
    authenticate,
    authorize(USER_ROLES.ADMIN),
    deleteVoucher
);

export default voucherRoutes;

