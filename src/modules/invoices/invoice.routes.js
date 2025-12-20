
import { Router } from 'express';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import { USER_ROLES } from '../../common/constants/enums.js';
import {
  createInvoice,
  getInvoiceByBooking,
  getInvoiceById,
  getInvoices,
  updateInvoiceStatus,
  adjustInvoiceFieldPrice,
} from './invoice.controller.js';


const routesInvoices = Router();

routesInvoices.post('/', createInvoice);
routesInvoices.get('/', getInvoices);
routesInvoices.get('/by-booking/:bookingId', getInvoiceByBooking);
routesInvoices.get('/:id', getInvoiceById);
routesInvoices.patch('/:id/adjust-field', authenticate, authorize(USER_ROLES.ADMIN), adjustInvoiceFieldPrice);
routesInvoices.patch('/:id', updateInvoiceStatus);

export default routesInvoices;
