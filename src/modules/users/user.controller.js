import { StatusCodes } from 'http-status-codes';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import User from './user.models.js';

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
