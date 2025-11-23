import createResponse from '../../utils/responses.js';
import { USER_ROLES } from '../constants/enums.js';
import { verifyToken } from '../../modules/auth/auth.utils.js';

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2) return null;
    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) return null;
    return token;
};

export const authenticate = (req, res, next) => {
    const token = getTokenFromHeader(req);

    if (!token || token === 'undefined' || token === 'null') {
        console.log('❌ No token or invalid token string from client:', token);
        return res
            .status(401)
            .json(createResponse(false, 401, 'Unauthorized: token missing', null));
    }

    try {
        //console.log('Verifying token:', token.slice(0, 30) + '...');
        const payload = verifyToken(token); // { _id, role, iat, exp }
        //  console.log('Token payload:', payload);
        req.user = payload;
        return next();
    } catch (error) {
        console.error('❌ JWT verify error:', error.message);
        return res
            .status(401)
            .json(createResponse(false, 401, 'Unauthorized: token invalid', null));
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
                .json(createResponse(false, 403, 'Forbidden: missing user role', null));
        }

        if (allowedRoles.includes(user.role)) return next();

        // ADMIN luôn pass
        if (user.role === USER_ROLES.ADMIN) return next();

        return res
            .status(403)
            .json(createResponse(false, 403, 'Forbidden: insufficient permissions', null));
    };

export default { authenticate, authorize };
