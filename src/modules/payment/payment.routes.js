import express from 'express';
import { createVnpayPayment, vnpayReturn } from './payment.controller.js';
// import { createVnpayPayment, vnpayReturn } from '../controllers/paymentController.js';

const routerPayment = express.Router();

// Tạo URL thanh toán
routerPayment.post('/vnpay/create', createVnpayPayment);

// Callback VNPAY trả về
routerPayment.get('/vnpay/return', vnpayReturn);

export default routerPayment;
