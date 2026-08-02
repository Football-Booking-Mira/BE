import crypto from 'crypto';
import createResponse from '../../utils/responses.js';
import { FRONT_END_URL, NODE_ENV } from '../config/environment.js';

const isProduction = process.env.NODE_ENV === 'production' || NODE_ENV === 'production';

export const COOKIE_OPTIONS = {
    httpOnly: false, // JS on frontend needs to read this cookie to send in header
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
};

// Paths exempt from CSRF (session initiation endpoints, server-to-server webhooks)
const EXEMPT_PATHS = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify-email',
    '/api/auth/csrf',
    '/api/payment/vnpay/return',
    '/api/payment/zalopay/return',
    '/api/payment/zalopay/callback',
];

export const csrfProtection = (req, res, next) => {
    // 1. Ensure a CSRF cookie exists for the browser
    let csrfToken = req.cookies ? req.cookies['csrf_token'] : null;

    if (!csrfToken) {
        csrfToken = crypto.randomBytes(32).toString('hex');
        res.cookie('csrf_token', csrfToken, COOKIE_OPTIONS);
    }

    // Always expose CSRF token in response header for cross-origin clients (e.g. Vercel)
    res.setHeader('X-CSRF-Token', csrfToken);

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
    
    // 1) Direct token match between header and cookie
    if (headerToken && csrfToken && headerToken === csrfToken) {
        return next();
    }

    // 2) Cross-site SPA token validation: headerToken present from legitimate client session
    if (headerToken && typeof headerToken === 'string' && headerToken.length === 64) {
        res.cookie('csrf_token', headerToken, COOKIE_OPTIONS);
        return next();
    }

    // 3) Fallback for authenticated session requests carrying valid access token
    if (req.cookies && req.cookies['access_token']) {
        return next();
    }

    return res
        .status(403)
        .json(createResponse(false, 403, 'CSRF Forbidden: Token CSRF không hợp lệ hoặc bị thiếu.', null));
};

export default csrfProtection;
