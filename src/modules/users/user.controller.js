import { StatusCodes } from 'http-status-codes';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import User from './user.models.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import sendMail from '../../utils/sendEmail.js';
import { generateToken } from '../auth/auth.utils.js';
import { FRONT_END_URL } from '../../common/config/environment.js';

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

export const generateRandomPassword = (length = 10) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$!';
    let pass = '';
    for (let i = 0; i < length; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
};

export const htmlSendPassword = (name, password, email, verifyLink) => {
    return `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <h2 style="color: #10b981; margin-top: 0;">Xin chào ${name},</h2>
            <p>Tài khoản khách hàng của bạn đã được khởi tạo thành công tại <b>MIRA Football</b>.</p>
            
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #10b981; margin: 20px 0;">
                <p style="margin: 4px 0;"><b>Email đăng nhập:</b> ${email}</p>
                <p style="margin: 4px 0;"><b>Mật khẩu ngẫu nhiên:</b> <code style="font-size: 16px; background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #0f172a;">${password}</code></p>
            </div>

            ${verifyLink ? `
            <div style="margin: 25px 0; padding: 16px; background-color: #f0fdf4; border-radius: 8px; border: 1px border-emerald-200;">
                <p style="margin-top: 0; font-weight: bold; color: #065f46;">Xác thực tài khoản của bạn:</p>
                <p style="font-size: 13px; color: #047857;">Nhấp vào nút bên dưới để xác thực địa chỉ email và kích hoạt đầy đủ tính năng tài khoản:</p>
                <div style="margin-top: 15px; margin-bottom: 15px;">
                    <a href="${verifyLink}" target="_blank" style="display: inline-block; background-color: #10b981; color: #ffffff; font-weight: bold; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-size: 14px;">
                        ✓ Xác thực tài khoản ngay
                    </a>
                </div>
                <p style="font-size: 11px; color: #64748b; margin-bottom: 0;">Hoặc copy liên kết sau vào trình duyệt: <br><a href="${verifyLink}" style="color: #0284c7; word-break: break-all;">${verifyLink}</a></p>
            </div>
            ` : ''}

            <p style="font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                Trân trọng,<br/>
                <b>Đội ngũ hỗ trợ MIRA Football</b>
            </p>
        </div>
    `;
};


export const htmlOfflineCustomerPassword = (name, email, password) => {
    return `
        <div style="font-family: Arial; line-height: 1.6;">
            <h2>Xin chào ${name},</h2>
            <p>Bạn vừa được tạo tài khoản tại hệ thống của chúng tôi.</p>
            <p>Thông tin đăng nhập của bạn:</p>
            <p><b>Email:</b> ${email}</p>
            <p><b>Mật khẩu:</b> ${password}</p>
            <br/>
            <p>Vui lòng đăng nhập và thay đổi mật khẩu để bảo mật.</p>
            <br/>
            <p>Trân trọng,</p>
            <p>Support Team</p>
        </div>
    `;
};


// POST /api/users  (tạo khách tại quầy)
// export const createOfflineCustomer = handleAsync(async (req, res, next) => {
//     const { name, phone, email } = req.body; // body đã được zod validate rồi

//     // kiểm tra trùng SĐT
//     const existedPhone = await User.findOne({ phone });
//     if (existedPhone) {
//         return res
//             .status(StatusCodes.BAD_REQUEST)
//             .json(
//                 createResponse(
//                     false,
//                     StatusCodes.BAD_REQUEST,
//                     'Số điện thoại đã tồn tại, vui lòng dùng SĐT khác!'
//                 )
//             );
//     }

//     // kiểm tra trùng email (nếu có)
//     if (email) {
//         const existedEmail = await User.findOne({ email });
//         if (existedEmail) {
//             return res
//                 .status(StatusCodes.BAD_REQUEST)
//                 .json(
//                     createResponse(
//                         false,
//                         StatusCodes.BAD_REQUEST,
//                         'Email đã được sử dụng trước đó!'
//                     )
//                 );
//         }
//     }

//     const user = await User.create({
//         name,
//         phone,
//         email: email || '',
//         role: 'user',
//         status: 'active', // khách tạo tại quầy cho phép dùng luôn
//         isEmailVerified: false,
//     });

//     return res
//         .status(StatusCodes.CREATED)
//         .json(createResponse(true, StatusCodes.CREATED, 'Tạo khách hàng mới thành công', user));
// });
export const createOfflineCustomer = handleAsync(async (req, res) => {
    const { name, phone, email } = req.body;

    // Kiểm tra trùng SĐT
    const existedPhone = await User.findOne({ phone });
    if (existedPhone) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json(createResponse(false, StatusCodes.BAD_REQUEST, 'Số điện thoại đã tồn tại, vui lòng dùng SĐT khác!'));
    }

    // Kiểm tra trùng email
    if (email) {
        const existedEmail = await User.findOne({ email });
        if (existedEmail) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json(createResponse(false, StatusCodes.BAD_REQUEST, 'Email đã được sử dụng trước đó!'));
        }
    }

    // === 1) Tạo mật khẩu ngẫu nhiên ===
    const rawPassword = generateRandomPassword(10);
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // === 2) Tạo token & link xác thực email ===
    let verificationToken;
    let verificationTokenExpires;
    let verifyLink;

    if (email) {
        verificationToken = generateToken({ email }, '24h');
        verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const frontendUrl = FRONT_END_URL || 'http://localhost:5173';
        verifyLink = `${frontendUrl}/verify-email?token=${verificationToken}`;
    }

    // === 3) Tạo user ===
    const user = await User.create({
        name,
        phone,
        email: email || '',
        password: hashedPassword,
        role: 'user',
        status: 'active',
        isEmailVerified: false,
        verificationToken,
        verificationTokenExpires,
    });

    // === 4) Gửi mật khẩu & link xác thực qua email (nếu có email) - Chạy background không làm treo request ===
    if (email) {
        sendMail({
            to: email,
            bcc: process.env.EMAIL || 'trinhquochungwork@gmail.com',
            subject: 'Thông tin tài khoản & Link xác thực - MIRA Football',
            html: htmlSendPassword(name, rawPassword, email, verifyLink),
        }).catch((mailErr) => {
            console.error('❌ Gửi email tạo tài khoản thất bại:', mailErr?.message || mailErr);
        });
    }

    return res
        .status(StatusCodes.CREATED)
        .json(createResponse(true, StatusCodes.CREATED, 'Tạo khách hàng mới thành công! Mật khẩu ngẫu nhiên và link xác thực đã được gửi qua email.', user));
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
    const currentUser = req.user;

    // Ownership & Admin privilege check
    const isOwner = currentUser && currentUser._id.toString() === id;
    const isAdmin = currentUser && currentUser.role === 'admin';

    if (!isOwner && !isAdmin) {
        return res.status(StatusCodes.FORBIDDEN).json(
            createResponse(false, StatusCodes.FORBIDDEN, 'Bạn không có quyền truy cập thông tin tài khoản này!')
        );
    }

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

        if (user._id.toString() === id) {
            // Nếu user cập nhật chính mình
            if (user.role === "admin") {
                // Admin tự cập nhật: được sửa tất cả các field (role, status + personal info)
                allowedFields = ["role", "status", "name", "phone", "email", "avatar"];
            } else {
                // User thường chỉ được sửa thông tin cá nhân
                allowedFields = ["name", "phone", "email", "avatar"];
            }
        } else if (user.role === "admin") {
            // Admin sửa người khác: chỉ sửa role và status
            allowedFields = ["role", "status"];
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


export const deleteUser = handleAsync(async (req, res, next) => {
    const { id } = req.params;       // ID user cần xóa
    const currentUser = req.user;    // user đang đăng nhập (từ middleware authenticate)

    // Kiểm tra user có tồn tại không
    const user = await User.findById(id);
    if (!user) {
        return res
            .status(StatusCodes.NOT_FOUND)
            .json(createResponse(false, StatusCodes.NOT_FOUND, 'Người dùng không tồn tại'));
    }

    // Chỉ admin hoặc chính chủ được xóa
    const isOwner = currentUser._id.toString() === id;
    const isAdmin = currentUser.role === 'admin';

    if (!isOwner && !isAdmin) {
        return res
            .status(StatusCodes.FORBIDDEN)
            .json(
                createResponse(
                    false,
                    StatusCodes.FORBIDDEN,
                    'Bạn không có quyền xóa tài khoản này'
                )
            );
    }

    // Xóa user
    await User.findByIdAndDelete(id);

    return res
        .status(StatusCodes.OK)
        .json(createResponse(true, StatusCodes.OK, 'Xóa tài khoản thành công'));
});


export const blockUser = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    const currentUser = req.user;

    // Kiểm tra quyền admin
    if (currentUser.role !== 'admin') {
        return res
            .status(StatusCodes.FORBIDDEN)
            .json(
                createResponse(
                    false,
                    StatusCodes.FORBIDDEN,
                    'Bạn không có quyền block người dùng'
                )
            );
    }

    const user = await User.findById(id);
    if (!user) {
        return res
            .status(StatusCodes.NOT_FOUND)
            .json(createResponse(false, StatusCodes.NOT_FOUND, 'Người dùng không tồn tại'));
    }

    // Cập nhật status = banned
    user.status = 'inactive';
    await user.save();

    return res
        .status(StatusCodes.OK)
        .json(createResponse(true, StatusCodes.OK, 'Block người dùng thành công', user));
});

export const unlockUser = handleAsync(async (req, res, next) => {
    const { id } = req.params;
    const currentUser = req.user;

    // Kiểm tra admin
    if (currentUser.role !== 'admin') {
        return res
            .status(StatusCodes.FORBIDDEN)
            .json(
                createResponse(
                    false,
                    StatusCodes.FORBIDDEN,
                    'Bạn không có quyền mở khóa người dùng'
                )
            );
    }

    const user = await User.findById(id);
    if (!user) {
        return res
            .status(StatusCodes.NOT_FOUND)
            .json(createResponse(false, StatusCodes.NOT_FOUND, 'Người dùng không tồn tại'));
    }

    // Cập nhật status = active
    user.status = 'active';
    await user.save();

    return res
        .status(StatusCodes.OK)
        .json(createResponse(true, StatusCodes.OK, 'Mở khóa người dùng thành công', user));
});
