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
import { FRONT_END_URL, NODE_ENV } from '../../common/config/environment.js';
import User from '../users/user.models.js';

const isProduction = process.env.NODE_ENV === 'production' || NODE_ENV === 'production';

// Secure HttpOnly cookie configuration options
export const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
};

export const register = handleAsync(async (req, res, next) => {
    // Explicitly enforce role 'user'
    const payload = {
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        phone: req.body.phone,
        avatar: req.body.avatar,
        role: 'user',
    };

    const response = await registerService(payload);

    const link = `${FRONT_END_URL}/verify-email?token=${response.verificationToken}`;
    sendMail({
        to: response.user.email,
        subject: 'Xác thực email để kích hoạt tài khoản',
        html: htmlVerify(response.user.email, response.user.name, link),
    }).catch((err) => console.error('❌ Email dispatch error:', err?.message || err));

    return res
        .status(StatusCodes.CREATED)
        .json(
            createResponse(
                true,
                StatusCodes.CREATED,
                'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản',
                {
                    user: {
                        _id: response.user._id,
                        name: response.user.name,
                        email: response.user.email,
                        phone: response.user.phone,
                        role: 'user',
                    },
                    message: 'Email xác thực đã được gửi',
                }
            )
        );
});

export const login = handleAsync(async (req, res, next) => {
    const data = await loginService(req.body); // { user, token }
    
    // Attach HttpOnly cookie
    res.cookie('access_token', data.token, COOKIE_OPTIONS);

    // Return safe user object without raw JWT token in JSON body if client uses cookies
    return res
        .status(StatusCodes.OK)
        .json(createResponse(true, StatusCodes.OK, 'Đăng nhập thành công', {
            user: data.user,
            token: data.token, // Retained for compatibility during frontend transition
        }));
});

export const getMe = handleAsync(async (req, res, next) => {
    const user = await User.findById(req.user._id).select('-password -verificationToken -resetPasswordToken');
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
    
    if (result.user && result.resetToken) {
        const link = `${FRONT_END_URL}/verify?token=${result.resetToken}`;
        sendMail({
            to: email,
            subject: 'Xác nhận đặt lại mật khẩu',
            html: htmlForgot(email, result.user.name, link),
        }).catch((err) => console.error('❌ Email dispatch error:', err?.message || err));
    }

    // Generic response regardless of whether email exists (prevents account enumeration)
    return res
        .status(StatusCodes.OK)
        .json(
            createResponse(
                true,
                StatusCodes.OK,
                'Nếu địa chỉ email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn.',
                null
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
