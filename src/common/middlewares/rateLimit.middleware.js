import createResponse from '../../utils/responses.js';

const rateLimitStore = new Map();

/**
 * Basic in-memory rate-limiter middleware
 * @param {number} windowMs - Time window in milliseconds (e.g. 15 * 60 * 1000 for 15 min)
 * @param {number} max - Max attempts allowed within time window
 * @param {string} message - Error message on limit exceed
 */
export const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 10, message = 'Quá nhiều yêu cầu từ IP này. Vui lòng thử lại sau.') => {
    return (req, res, next) => {
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
        const key = `${req.baseUrl}${req.path}:${ip}`;
        const now = Date.now();

        const record = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
        } else {
            record.count += 1;
        }

        rateLimitStore.set(key, record);

        if (record.count > max) {
            return res.status(429).json(createResponse(false, 429, message, null));
        }

        next();
    };
};

export const authRateLimiter = createRateLimiter(15 * 60 * 1000, 10, 'Bạn đã thử quá nhiều lần! Vui lòng thử lại sau 15 phút.');
