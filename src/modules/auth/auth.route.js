import { Router } from "express";
import validBodyRequest from "../../common/middlewares/validBodyRequest.js";
import {
  forgotPassword,
  login,
  register,
  resetPassword,
  verifyResetToken,
} from "./auth.controller.js";
import { loginValidation, registerValidation } from "./auth.validation.js";

const authRouter = Router();

authRouter.post("/register", validBodyRequest(registerValidation), register);
authRouter.post("/login", login);
authRouter.post("/forgot-password", forgotPassword);

authRouter.post("/reset-password", resetPassword);
authRouter.post("/verify", verifyResetToken);

export default authRouter;
