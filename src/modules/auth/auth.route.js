import { Router } from "express";
import validBodyRequest from "../../common/middlewares/validBodyRequest.js";
import { forgotPassword, login, register, resetPassword, verifyEmail, verifyResetToken } from "./auth.controller.js";
import { loginValidation, registerValidation } from "./auth.validation.js";

const authRouter = Router();

authRouter.post("/register",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Đăng ký tài khoản mới'
    validBodyRequest(registerValidation),
    register
);

authRouter.post("/login",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Đăng nhập'
    login
);

authRouter.post("/forgot-password",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Quên mật khẩu'
    forgotPassword
);

authRouter.post("/reset-password",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Đặt lại mật khẩu'
    resetPassword
);

authRouter.post("/verify-token",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Xác thực token đặt lại mật khẩu'
    verifyResetToken
);

authRouter.post("/verify-email",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Xác thực email'
    verifyEmail
);

export default authRouter;
