import { Router } from 'express';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import validBodyRequest from '../../common/middlewares/validBodyRequest.js';
import { getBookingItems, upsertBookingItems } from './bookingItem.controller.js';
import { upsertBookingItemsSchema } from './bookingItem.schema.js';

const routesBookingItem = Router();
routesBookingItem.get('/:bookingId',
    // #swagger.tags = ['BookingItems']
    // #swagger.summary = 'Lấy danh sách thiết bị theo đơn đặt sân'
    authenticate, getBookingItems
);
routesBookingItem.put('/:bookingId',
    // #swagger.tags = ['BookingItems']
    // #swagger.summary = 'Cập nhật danh sách thiết bị cho đơn đặt sân'
    authenticate, authorize('admin'), validBodyRequest(upsertBookingItemsSchema), upsertBookingItems
);

export default routesBookingItem;
