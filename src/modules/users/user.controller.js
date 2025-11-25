import { StatusCodes } from 'http-status-codes';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import User from './user.models.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// GET /api/users?search=...
export const searchUsers = handleAsync(async (req, res, next) => {
    const { search } = req.query;

    let query = {};
    if (search && String(search).trim() !== '') {
        const regex = new RegExp(String(search).trim(), 'i');
        query = {
            $or: [{ name: regex }, { phone: regex }, { email: regex }],
        };
    }

    const users = await User.find(query).sort({ createdAt: -1 });

    return res
        .status(StatusCodes.OK)
        .json(createResponse(true, StatusCodes.OK, 'Lấy danh sách khách hàng thành công', users));
});

// POST /api/users  (tạo khách tại quầy)
export const createOfflineCustomer = handleAsync(async (req, res, next) => {
    const { name, phone, email } = req.body; // body đã được zod validate rồi

    // kiểm tra trùng SĐT
    const existedPhone = await User.findOne({ phone });
    if (existedPhone) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json(
                createResponse(
                    false,
                    StatusCodes.BAD_REQUEST,
                    'Số điện thoại đã tồn tại, vui lòng dùng SĐT khác!'
                )
            );
    }

    // kiểm tra trùng email (nếu có)
    if (email) {
        const existedEmail = await User.findOne({ email });
        if (existedEmail) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json(
                    createResponse(
                        false,
                        StatusCodes.BAD_REQUEST,
                        'Email đã được sử dụng trước đó!'
                    )
                );
        }
    }

    const user = await User.create({
        name,
        phone,
        email: email || '',
        role: 'user',
        status: 'active', // khách tạo tại quầy cho phép dùng luôn
        isEmailVerified: false,
    });

    return res
        .status(StatusCodes.CREATED)
        .json(createResponse(true, StatusCodes.CREATED, 'Tạo khách hàng mới thành công', user));
});

export const registerOnlineUser = handleAsync(async (req, res) => {
    const { name, email, phone, password } = req.body;

    // Kiểm tra email trùng
    const existedEmail = await User.findOne({ email });
    if (existedEmail) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json(createResponse(false, StatusCodes.BAD_REQUEST, 'Email đã tồn tại!'));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo token xác thực email
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = Date.now() + 15 * 60 * 1000; // 15 phút

    const newUser = await User.create({
        name,
        email,
        phone,
        password: hashedPassword,
        role: 'user',
        status: 'inactive',
        isEmailVerified: false,
        verificationToken,
        verificationTokenExpires,
    });

    const userObj = newUser.toObject();
    delete userObj.password;

    return res.status(StatusCodes.CREATED).json(
        createResponse(
            true,
            StatusCodes.CREATED,
            'Đăng ký thành công! Vui lòng kiểm tra email để kích hoạt tài khoản.',
            userObj
        )
    );
});

export const getUserDetail = handleAsync(async (req, res) => {
    const { id } = req.params;

    // lấy user (select password = false)
    const user = await User.findById(id).select('-password');

    if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json(
            createResponse(false, StatusCodes.NOT_FOUND, 'Không tìm thấy người dùng!')
        );
    }

    return res.status(StatusCodes.OK).json(
        createResponse(true, StatusCodes.OK, 'Lấy thông tin người dùng thành công', user)
    );
});


export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user; // thông tin user đang đăng nhập
        const body = req.body;

        // Lấy user cần cập nhật
        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({ message: "Không tìm thấy user" });
        }

        // Phân quyền cập nhật
        let allowedFields = [];

        if (user.role === "admin") {
            // Admin chỉ được sửa role, status
            allowedFields = ["role", "status"];
        } else if (user._id.toString() === id) {
            // User chỉ được sửa chính mình → name, phone, email, avatar
            allowedFields = ["name", "phone", "email", "avatar"];
        } else {
            return res.status(403).json({
                message: "Bạn không có quyền thực hiện update user này",
            });
        }

        // Kiểm tra field không được phép
        const invalidFields = Object.keys(body).filter(
            (key) => !allowedFields.includes(key)
        );

        if (invalidFields.length > 0) {
            return res.status(403).json({
                message: "Bạn không có quyền cập nhật các trường này",
                invalidFields,
            });
        }

        // Cập nhật field hợp lệ
        allowedFields.forEach((field) => {
            if (body[field] !== undefined) {
                targetUser[field] = body[field];
            }
        });

        await targetUser.save();

        res.json({
            message: "Cập nhật thành công",
            user: targetUser,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
