import { Router } from 'express';
import { authenticate, authorize } from '../../common/middlewares/auth.middleware.js';
import { getBookingItems, upsertBookingItems } from './bookingItem.controller.js';

const routesBookingItem = Router();

// Lấy danh sách thiết bị của 1 booking (user & admin)
routesBookingItem.get('/:bookingId', authenticate, getBookingItems);

// Admin cập nhật thiết bị cho 1 booking
routesBookingItem.put('/:bookingId', authenticate, authorize('admin'), upsertBookingItems);

export default routesBookingItem;
