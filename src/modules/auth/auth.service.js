import { StatusCodes } from 'http-status-codes';
import createError from '../../utils/error.js';
import userModels from '../users/user.models.js';
import { generateToken, hashPassword, verifyToken } from './auth.utils.js';
import bcrypt from 'bcryptjs';

//  ĐĂNG KÝ
export const registerService = async (payload) => {
    const existsUser = await userModels.findOne({ email: payload.email });

    // Nếu user đã tồn tại và email đã verified, không cho đăng ký lại
    if (existsUser && existsUser.isEmailVerified) {
        throw createError(StatusCodes.BAD_REQUEST, 'Tài khoản này đã được đăng ký!');
    }

    const password = await hashPassword(payload.password);
    const verificationToken = generateToken({ email: payload.email }, '15m');

    // Nếu user chưa xác thực email, cập nhật token mới
    if (existsUser && !existsUser.isEmailVerified) {
        existsUser.password = password;
        const user = await userModels.findByIdAndUpdate(existsUser._id, {
            password,
            verificationToken,
            verificationTokenExpires: new Date(Date.now() + 15 * 60 * 1000),
        });

        return { user, verificationToken };
    }

    // Tạo user mới nếu chưa tồn tại
    const user = await userModels.create({
        ...payload,
        password,
        status: 'inactive',
        isEmailVerified: false,
        verificationToken,
        verificationTokenExpires: new Date(Date.now() + 15 * 60 * 1000),
    });

    return { user, verificationToken };
};

//  ĐĂNG NHẬP
export const loginService = async (payload) => {
    const findUser = await userModels.findOne({ email: payload.email });
    if (!findUser) {
        throw createError(StatusCodes.BAD_REQUEST, 'Thông tin đăng nhập không chính xác!');
    }

    if (findUser.status !== 'active') {
        throw createError(
            StatusCodes.UNAUTHORIZED,
            'Tài khoản chưa được kích hoạt hoặc đã bị vô hiệu hóa!'
        );
    }

    const matchedPassword = await bcrypt.compare(payload.password, findUser.password);
    if (!matchedPassword) {
        throw createError(StatusCodes.BAD_REQUEST, 'Thông tin đăng nhập không chính xác!');
    }

    //  Payload JWT – NHỚ có role
    const jwtData = {
        _id: findUser._id,
        role: findUser.role,
        email: findUser.email,
        name: findUser.name,
    };

    //  Đặt tên chung là token (không dùng accessToken nữa)
    const token = generateToken(jwtData);

    // Có thể gửi toàn bộ user, nhưng ẩn password cho sạch
    const userSafe = {
        _id: findUser._id,
        name: findUser.name,
        email: findUser.email,
        phone: findUser.phone,
        role: findUser.role,
        status: findUser.status,
        avatar: findUser.avatar,
        isEmailVerified: findUser.isEmailVerified,
    };

    return { user: userSafe, token };
};

//  QUÊN MẬT KHẨU
export const forgotPasswordService = async (email) => {
    const user = await userModels.findOne({ email });
    if (!user) {
        throw createError(StatusCodes.NOT_FOUND, 'Email không tồn tại trong hệ thống!');
    }

    const resetToken = generateToken({ _id: user._id }, '15m');

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    return { resetToken, email: user.email, user };
};

//  RESET MẬT KHẨU
export const resetPasswordService = async (resetToken, newPassword) => {
    try {
        const decoded = verifyToken(resetToken);

        const user = await userModels.findOne({
            _id: decoded._id,
            resetPasswordToken: resetToken,
            resetPasswordExpires: { $gt: new Date() },
        });

        if (!user) {
            throw createError(StatusCodes.BAD_REQUEST, 'Token reset không hợp lệ hoặc đã hết hạn!');
        }

        const hashedPassword = await hashPassword(newPassword);

        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        return { message: 'Mật khẩu đã được cập nhật thành công!' };
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw createError(StatusCodes.BAD_REQUEST, 'Token reset không hợp lệ!');
        }
        throw error;
    }
};

//  VERIFY RESET TOKEN
export const verifyResetTokenService = async (resetToken) => {
    try {
        const decoded = verifyToken(resetToken);

        const user = await userModels.findOne({
            _id: decoded._id,
            resetPasswordToken: resetToken,
            resetPasswordExpires: { $gt: new Date() },
        });

        if (!user) {
            throw createError(StatusCodes.BAD_REQUEST, 'Token reset không hợp lệ hoặc đã hết hạn!');
        }

        return {
            valid: true,
            message: 'Token hợp lệ',
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
            },
        };
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw createError(StatusCodes.UNAUTHORIZED, 'Token reset không hợp lệ!');
        }
        throw error;
    }
};

//  VERIFY EMAIL
export const verifyEmailService = async (verificationToken) => {
    try {
        const decoded = verifyToken(verificationToken);

        const user = await userModels.findOne({
            email: decoded.email,
        });

        if (!user) {
            throw createError(StatusCodes.BAD_REQUEST, 'Email không tìm thấy trong hệ thống!');
        }

        // So sánh token chính xác
        if (user.verificationToken !== verificationToken) {
            throw createError(StatusCodes.BAD_REQUEST, 'Token xác thực không khớp!');
        }

        // Kiểm tra token chưa hết hạn
        if (!user.verificationTokenExpires || new Date() > user.verificationTokenExpires) {
            throw createError(
                StatusCodes.BAD_REQUEST,
                'Token xác thực đã hết hạn! Vui lòng đăng ký lại.'
            );
        }

        // Nếu email đã verified, không cần xác thực lại
        if (user.isEmailVerified) {
            return {
                message: 'Email đã được xác thực trước đó. Bạn có thể đăng nhập.',
                user: {
                    _id: user._id,
                    email: user.email,
                    name: user.name,
                    status: user.status,
                    role: user.role,
                },
                token: generateToken({
                    _id: user._id,
                    role: user.role,
                    email: user.email,
                    name: user.name,
                }),
            };
        }

        // Cập nhật trạng thái xác thực
        user.isEmailVerified = true;
        user.status = 'active';
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

        const jwtData = {
            _id: user._id,
            role: user.role,
            email: user.email,
            name: user.name,
        };
        const token = generateToken(jwtData);

        return {
            message: 'Email đã được xác thực thành công! Tài khoản của bạn đã được kích hoạt.',
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                status: user.status,
                role: user.role,
            },
            token,
        };
    } catch (error) {
        console.error('❌ Verify email error:', error.message);
        if (error.name === 'JsonWebTokenError') {
            throw createError(StatusCodes.UNAUTHORIZED, 'Token xác thực không hợp lệ!');
        }
        throw error;
    }
};
