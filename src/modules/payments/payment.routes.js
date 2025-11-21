import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { createVnPayPayment, vnPayIpn, vnPayReturn, confirmManualPayment } from "./payment.controller.js";

const paymentRoutes = Router();

paymentRoutes.post("/vnpay/create", authenticate, createVnPayPayment);
paymentRoutes.post("/manual/confirm", authenticate, confirmManualPayment);
paymentRoutes.get("/vnpay/return", vnPayReturn);
paymentRoutes.get("/vnpay/ipn", vnPayIpn);

export default paymentRoutes;


