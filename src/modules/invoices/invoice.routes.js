import { Router } from 'express';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import { USER_ROLES } from '../../common/constants/enums.js';
import { createInvoice, getInvoiceByBooking, getInvoiceById, getInvoices, updateInvoiceStatus, adjustInvoiceFieldPrice } from './invoice.controller.js';

const routesInvoices = Router();
routesInvoices.post('/',
    // #swagger.tags = ['Invoices']
    // #swagger.summary = 'Tạo hóa đơn mới'
    createInvoice
);
routesInvoices.get('/',
    // #swagger.tags = ['Invoices']
    // #swagger.summary = 'Lấy danh sách hóa đơn'
    getInvoices
);
routesInvoices.get('/by-booking/:bookingId',
    // #swagger.tags = ['Invoices']
    // #swagger.summary = 'Lấy hóa đơn theo đơn đặt sân'
    getInvoiceByBooking
);
routesInvoices.get('/:id',
    // #swagger.tags = ['Invoices']
    // #swagger.summary = 'Lấy chi tiết hóa đơn theo ID'
    getInvoiceById
);
routesInvoices.patch('/:id/adjust-field',
    // #swagger.tags = ['Invoices']
    // #swagger.summary = 'Điều chỉnh giá sân trong hóa đơn'
    authenticate, authorize(USER_ROLES.ADMIN), adjustInvoiceFieldPrice
);
routesInvoices.patch('/:id',
    // #swagger.tags = ['Invoices']
    // #swagger.summary = 'Cập nhật trạng thái hóa đơn'
    updateInvoiceStatus
);

export default routesInvoices;
