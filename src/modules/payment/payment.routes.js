import express from 'express';
import { createVnpayPayment, vnpayReturn, createZalopayPayment, zalopayReturn } from './payment.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { paymentRateLimiter } from '../../common/middlewares/rateLimit.middleware.js';

const routerPayment = express.Router();

routerPayment.post('/vnpay/create',
    // #swagger.tags = ['Payment']
    // #swagger.summary = 'Tạo thanh toán VNPay'
    authenticate,
    paymentRateLimiter,
    createVnpayPayment
);

routerPayment.get('/vnpay/return',
    // #swagger.tags = ['Payment']
    // #swagger.summary = 'Xử lý kết quả trả về từ VNPay'
    vnpayReturn
);

routerPayment.post('/zalopay/create',
    // #swagger.tags = ['Payment']
    // #swagger.summary = 'Tạo thanh toán ZaloPay'
    authenticate,
    paymentRateLimiter,
    createZalopayPayment
);

routerPayment.get('/zalopay/return',
    // #swagger.tags = ['Payment']
    // #swagger.summary = 'Xử lý kết quả trả về từ ZaloPay'
    zalopayReturn
);

export default routerPayment;
