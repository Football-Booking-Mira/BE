import crypto from 'crypto';
import createResponse from '../../utils/responses.js';
import { FRONT_END_URL, NODE_ENV } from '../config/environment.js';

const isProduction = NODE_ENV === 'production';

const COOKIE_OPTIONS = {
    httpOnly: false, // JS on frontend needs to read this cookie to send in header
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
};

// Paths exempt from CSRF (server-to-server webhooks or public forms)
const EXEMPT_PATHS = [
    '/api/payment/vnpay/return',
    '/api/payment/zalopay/return',
    '/api/payment/zalopay/callback',
];

export const csrfProtection = (req, res, next) => {
    // 1. Ensure a CSRF cookie exists
    let csrfToken = req.cookies ? req.cookies['csrf_token'] : null;

    if (!csrfToken) {
        csrfToken = crypto.randomBytes(32).toString('hex');
        res.cookie('csrf_token', csrfToken, COOKIE_OPTIONS);
    }

    // Safe HTTP methods don't need CSRF check
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
        return next();
    }

    // Check path exemption
    const currentPath = req.originalUrl || req.url;
    const isExempt = EXEMPT_PATHS.some((path) => currentPath.startsWith(path));
    if (isExempt) {
        return next();
    }

    // Validate CSRF token for state-changing requests (POST, PUT, PATCH, DELETE)
    const headerToken = req.headers['x-csrf-token'] || req.headers['X-CSRF-Token'];
    
    if (!headerToken || !csrfToken || headerToken !== csrfToken) {
        return res
            .status(403)
            .json(createResponse(false, 403, 'CSRF Forbidden: Token CSRF không hợp lệ hoặc bị thiếu.', null));
    }

    next();
};

export default csrfProtection;
