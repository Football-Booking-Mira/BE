import express from 'express';
import { createVnpayPayment, vnpayReturn, createZalopayPayment, zalopayReturn } from './payment.controller.js';

const routerPayment = express.Router();

// Tạo URL thanh toán
routerPayment.post('/vnpay/create', createVnpayPayment);

// Callback VNPAY trả về
routerPayment.get('/vnpay/return', vnpayReturn);

// Tạo URL thanh toán ZALOPAY
routerPayment.post('/zalopay/create', createZalopayPayment);

// Callback ZALOPAY trả về
routerPayment.get('/zalopay/return', zalopayReturn);

export default routerPayment;
