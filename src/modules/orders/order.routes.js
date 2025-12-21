import express from 'express';
import { getOrdersAdmin } from './order.controller.js';

const router = express.Router();

router.get('/admin/orders', getOrdersAdmin);

export default router;
