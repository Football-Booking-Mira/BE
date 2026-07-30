import { Router } from 'express';
import { USER_ROLES } from '../../common/constants/enums.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import {
    createVoucher, deleteVoucher, getPublicVouchers, getVoucherById,
    getVoucherStats, getVouchers, getVouchersDebug, updateVoucher, validateVoucher,
} from './voucher.controller.js';
import { voucherSchema } from './voucher.schema.js';
import { voucherApplySchema } from './voucherApply.schema.js';

const voucherRoutes = Router();
voucherRoutes.get('/public',
    // #swagger.tags = ['Vouchers']
    // #swagger.summary = 'Lấy danh sách voucher công khai'
    getPublicVouchers
);
voucherRoutes.get('/debug',
    // #swagger.tags = ['Vouchers']
    // #swagger.summary = 'Lấy danh sách voucher (debug - admin only)'
    authenticate, authorize(USER_ROLES.ADMIN), getVouchersDebug
);
voucherRoutes.get('/',
    // #swagger.tags = ['Vouchers']
    // #swagger.summary = 'Lấy danh sách voucher (admin)'
    authenticate, authorize(USER_ROLES.ADMIN), getVouchers
);
voucherRoutes.post('/',
    // #swagger.tags = ['Vouchers']
    // #swagger.summary = 'Tạo voucher mới'
    authenticate, authorize(USER_ROLES.ADMIN), validBodyRequest(voucherSchema), createVoucher
);
voucherRoutes.post('/validate',
    // #swagger.tags = ['Vouchers']
    // #swagger.summary = 'Kiểm tra và áp dụng voucher'
    authenticate, validBodyRequest(voucherApplySchema), validateVoucher
);
voucherRoutes.get('/:voucherId/stats',
    // #swagger.tags = ['Vouchers']
    // #swagger.summary = 'Lấy thống kê voucher'
    authenticate, authorize(USER_ROLES.ADMIN), getVoucherStats
);
voucherRoutes.get('/:voucherId',
    // #swagger.tags = ['Vouchers']
    // #swagger.summary = 'Lấy chi tiết voucher theo ID'
    authenticate, authorize(USER_ROLES.ADMIN), getVoucherById
);
voucherRoutes.put('/:voucherId',
    // #swagger.tags = ['Vouchers']
    // #swagger.summary = 'Cập nhật voucher'
    authenticate, authorize(USER_ROLES.ADMIN), validBodyRequest(voucherSchema), updateVoucher
);
voucherRoutes.delete('/:voucherId',
    // #swagger.tags = ['Vouchers']
    // #swagger.summary = 'Xóa voucher'
    authenticate, authorize(USER_ROLES.ADMIN), deleteVoucher
);

export default voucherRoutes;
