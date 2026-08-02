import { Router } from "express";
import validBodyRequest from "../../common/middlewares/validBodyRequest.js";
import { authenticate, authorize } from "../../common/middlewares/auth.middleware.js";
import { forgotPassword, login, register, resetPassword, verifyEmail, verifyResetToken, getMe, logout, getCsrfToken } from "./auth.controller.js";
import { loginValidation, registerValidation } from "./auth.validation.js";

import { authRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";

const authRouter = Router();

authRouter.get("/csrf", getCsrfToken);

authRouter.post("/register",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Đăng ký tài khoản mới'
    authRateLimiter,
    validBodyRequest(registerValidation),
    register
);

authRouter.post("/login",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Đăng nhập'
    authRateLimiter,
    validBodyRequest(loginValidation),
    login
);

authRouter.get("/me",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Lấy thông tin người dùng hiện tại'
    authenticate,
    getMe
);

authRouter.post("/logout",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Đăng xuất'
    logout
);

authRouter.post("/forgot-password",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Quên mật khẩu'
    authRateLimiter,
    forgotPassword
);

authRouter.post("/reset-password",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Đặt lại mật khẩu'
    authRateLimiter,
    resetPassword
);

authRouter.post("/verify-token",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Xác thực token đặt lại mật khẩu'
    authRateLimiter,
    verifyResetToken
);

authRouter.post("/verify-email",
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Xác thực email'
    authRateLimiter,
    verifyEmail
);

export default authRouter;
