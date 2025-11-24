import express from "express";
import { sendPaymentSuccessEmail } from "./email.controller.js";

const router = express.Router();

router.post("/payment-success", sendPaymentSuccessEmail);

export default router;
