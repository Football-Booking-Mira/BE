import createResponse from '../../utils/responses.js';
import { USER_ROLES } from '../constants/enums.js';
import { verifyToken } from '../../modules/auth/auth.utils.js';
import User from '../../modules/users/user.models.js';

const getTokenFromReq = (req) => {
    // 1. Prioritize HttpOnly cookie
    if (req.cookies && req.cookies.access_token) {
        return req.cookies.access_token;
    }
    // 2. Fallback to Authorization Header
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2) return null;
    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) return null;
    return token;
};

export const authenticate = async (req, res, next) => {
    const token = getTokenFromReq(req);

    if (!token || token === 'undefined' || token === 'null') {
        return res
            .status(401)
            .json(createResponse(false, 401, 'Unauthorized: Chưa xác thực phiên đăng nhập', null));
    }

    try {
        const payload = verifyToken(token); // { _id, role, iat, exp }

        //  Database Lookup: Ensure user exists and is active (chống token cũ/bị khóa)
        const dbUser = await User.findById(payload._id).select('_id role status email name').lean();
        if (!dbUser) {
            return res
                .status(401)
                .json(createResponse(false, 401, 'Unauthorized: Tài khoản không tồn tại', null));
        }

        if (dbUser.status !== 'active') {
            return res
                .status(401)
                .json(createResponse(false, 401, 'Unauthorized: Tài khoản của bạn đã bị khóa hoặc chưa kích hoạt', null));
        }

        // Attach verified MongoDB user data (not relying solely on payload)
        req.user = {
            _id: dbUser._id,
            role: dbUser.role,
            status: dbUser.status,
            email: dbUser.email,
            name: dbUser.name,
        };

        return next();
    } catch (error) {
        return res
            .status(401)
            .json(createResponse(false, 401, 'Unauthorized: Token không hợp lệ hoặc đã hết hạn', null));
    }
};

export const authorize =
    (...allowedRoles) =>
    (req, res, next) => {
        if (!allowedRoles || allowedRoles.length === 0) return next();

        const user = req.user;
        if (!user || !user.role) {
            return res
                .status(403)
                .json(createResponse(false, 403, 'Forbidden: Thiếu thông tin quyền người dùng', null));
        }

        if (allowedRoles.includes(user.role)) return next();

        // ADMIN luôn pass
        if (user.role === USER_ROLES.ADMIN) return next();

        return res
            .status(403)
            .json(createResponse(false, 403, 'Forbidden: Bạn không có quyền truy cập tài nguyên này', null));
    };

export default { authenticate, authorize };
