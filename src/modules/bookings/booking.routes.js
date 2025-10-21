import { Router } from 'express';
import { cancelBooking, checkinBooking, checkoutBooking, createBooking, deleteBooking, getAllBookings, getBookingById, updateBooking, updatePaymentStatus } from './booking.controller.js';

const routesBookings = Router();

routesBookings.post("/", createBooking);
routesBookings.get("/", getAllBookings);
routesBookings.get("/:id", getBookingById);
routesBookings.put("/:id", updateBooking);
routesBookings.delete("/:id", deleteBooking);

routesBookings.post("/checkin", checkinBooking);
routesBookings.post("/checkout", checkoutBooking);
routesBookings.put("/:id/cancel", cancelBooking);
routesBookings.put("/:id/payment-status", updatePaymentStatus);
export default routesBookings;
