import createResponse from '../../utils/responses.js';
import jwt from 'jsonwebtoken';
import { JWT_ACCESS_SECRECT } from '../config/environment.js';
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
    try {
        const token = getTokenFromHeader(req);
        if (!token) {
            return res.status(401).json(createResponse(false, 401, 'Unauthorized: token missing'));
        }

        const payload = jwt.verify(token, JWT_ACCESS_SECRECT || 'default_secret');
        req.user = payload;
        return next();
    } catch (error) {
        return res.status(401).json(createResponse(false, 401, 'Unauthorized: token invalid'));
    }
};

export const authorize =
    (...allowedRoles) =>
    (req, res, next) => {
        if (!allowedRoles || allowedRoles.length === 0) return next();

        const user = req.user;
        if (!user || !user.role) {
            return res.status(403).json(createResponse(false, 403, 'Forbidden: missing user role'));
        }

        if (allowedRoles.includes(user.role)) return next();

        if (user.role === USER_ROLES.ADMIN) return next();

        return res
            .status(403)
            .json(createResponse(false, 403, 'Forbidden: insufficient permissions'));
    };

export default { authenticate, authorize };
