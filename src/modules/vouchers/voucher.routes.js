import { Router } from 'express';
import { USER_ROLES } from '../../common/constants/enums.js';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { createVoucher, getVoucherStats, validateVoucher } from './voucher.controller.js';
import { voucherSchema } from './voucher.schema.js';
import { voucherApplySchema } from './voucherApply.schema.js';

const voucherRoutes = Router();

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

export default voucherRoutes;

