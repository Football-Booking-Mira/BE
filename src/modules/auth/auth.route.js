import { Router } from "express";
import validBodyRequest from "../../common/middlewares/validBodyRequest.js";
import {
  forgotPassword,
  login,
  register,
  resetPassword,
} from "./auth.controller.js";
import { loginValidation, registerValidation } from "./auth.validation.js";

const authRouter = Router();

authRouter.post("/register", validBodyRequest(registerValidation), register);
authRouter.post("/login", validBodyRequest(loginValidation), login);
authRouter.post("/forgot-password", forgotPassword);

authRouter.post("/reset-password", resetPassword);

export default authRouter;
