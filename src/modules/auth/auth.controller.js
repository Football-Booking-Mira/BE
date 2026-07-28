import { StatusCodes } from 'http-status-codes';
import handleAsync from '../../utils/handleAsync.js';
import {
    loginService,
    registerService,
    forgotPasswordService,
    resetPasswordService,
    verifyResetTokenService,
    verifyEmailService,
} from './auth.service.js';
import sendMail from '../../utils/sendEmail.js';
import { htmlForgot, htmlVerify } from '../../utils/renderHMTLTemp.js';
import createResponse from '../../utils/responses.js';
import { FRONT_END_URL } from '../../common/config/environment.js';
import User from '../users/user.models.js';

const isProduction = process.env.NODE_ENV === 'production';

// Cookie configuration options
export const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
};

export const register = handleAsync(async (req, res, next) => {
    // Force role to user to prevent mass assignment vulnerability
    const payload = {
        ...req.body,
        role: 'user',
    };

    const response = await registerService(payload);

    const link = `${FRONT_END_URL}/verify-email?token=${response.verificationToken}`;
    await sendMail({
        to: response.user.email,
        subject: 'Xác thực email để kích hoạt tài khoản',
        html: htmlVerify(response.user.email, response.user.name, link),
    });

    return res
        .status(StatusCodes.CREATED)
        .json(
            createResponse(
                true,
                StatusCodes.CREATED,
                'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản',
                { user: response.user, message: 'Email xác thực đã được gửi' }
            )
        );
});

export const login = handleAsync(async (req, res, next) => {
    const data = await loginService(req.body); // { user, token }
    
    // Attach HttpOnly cookie
    res.cookie('access_token', data.token, COOKIE_OPTIONS);

    return res
        .status(StatusCodes.OK)
        .json(createResponse(true, StatusCodes.OK, 'Đăng nhập thành công', data));
});

export const getMe = handleAsync(async (req, res, next) => {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
        return res
            .status(StatusCodes.NOT_FOUND)
            .json(createResponse(false, StatusCodes.NOT_FOUND, 'Không tìm thấy người dùng'));
    }
    return res
        .status(StatusCodes.OK)
        .json(createResponse(true, StatusCodes.OK, 'Lấy thông tin người dùng thành công', user));
});

export const logout = handleAsync(async (req, res, next) => {
    res.clearCookie('access_token', {
        ...COOKIE_OPTIONS,
        maxAge: 0,
    });
    return res
        .status(StatusCodes.OK)
        .json(createResponse(true, StatusCodes.OK, 'Đăng xuất thành công'));
});

export const forgotPassword = handleAsync(async (req, res, next) => {
    const { email } = req.body;
    const result = await forgotPasswordService(email);
    const link = `${FRONT_END_URL}/verify?token=${result.resetToken}`;
    await sendMail({
        to: email,
        subject: 'Xác nhận đặt lại mật khẩu',
        html: htmlForgot(email, result.user.name, link),
    });
    return res
        .status(StatusCodes.OK)
        .json(
            createResponse(
                true,
                StatusCodes.OK,
                'Đã gửi link reset mật khẩu đến email của bạn! ' + result.email,
                { email: result.email }
            )
        );
});

export const resetPassword = handleAsync(async (req, res, next) => {
    const { resetToken, newPassword } = req.body;
    const result = await resetPasswordService(resetToken, newPassword);
    return res.status(StatusCodes.OK).json(createResponse(true, StatusCodes.OK, result.message));
});

export const verifyResetToken = handleAsync(async (req, res, next) => {
    const { resetToken } = req.body;
    const result = await verifyResetTokenService(resetToken);
    return res
        .status(StatusCodes.OK)
        .json(createResponse(true, StatusCodes.OK, result.message, result.user));
});

export const verifyEmail = handleAsync(async (req, res, next) => {
    const { verificationToken } = req.body;
    const result = await verifyEmailService(verificationToken);

    if (result.token) {
        res.cookie('access_token', result.token, COOKIE_OPTIONS);
    }

    return res.status(StatusCodes.OK).json(
        createResponse(true, StatusCodes.OK, result.message, {
            user: result.user,
            token: result.token,
        })
    );
});
