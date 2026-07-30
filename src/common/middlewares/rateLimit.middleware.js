import createResponse from '../../utils/responses.js';

const rateLimitStore = new Map();

// Periodic cleanup to prevent memory leaks (every 10 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
        if (now > record.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}, 10 * 60 * 1000);

/**
 * In-memory rate-limiter middleware
 * @param {number} windowMs - Time window in milliseconds
 * @param {number} max - Max attempts allowed within time window
 * @param {string} message - Error message on limit exceed
 */
export const createRateLimiter = (
    windowMs = 15 * 60 * 1000,
    max = 10,
    message = 'Quá nhiều yêu cầu từ IP này. Vui lòng thử lại sau.'
) => {
    return (req, res, next) => {
        const rawIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown-ip';
        const ip = Array.isArray(rawIp) ? rawIp[0] : String(rawIp).split(',')[0].trim();
        const key = `${req.baseUrl || ''}${req.path || ''}:${ip}`;
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

export const authRateLimiter = createRateLimiter(
    15 * 60 * 1000,
    10,
    'Bạn đã thử quá nhiều lần! Vui lòng thử lại sau 15 phút.'
);

export const apiRateLimiter = createRateLimiter(
    1 * 60 * 1000,
    120,
    'Yêu cầu quá dồn dập. Vui lòng thử lại sau 1 phút.'
);

export const chatRateLimiter = createRateLimiter(
    1 * 60 * 1000,
    10,
    'Bạn đang hỏi quá nhanh! Vui lòng đợi 1 phút trước khi tiếp tục trò chuyện.'
);

export const contactRateLimiter = createRateLimiter(
    15 * 60 * 1000,
    5,
    'Bạn đã gửi quá nhiều phản hồi. Vui lòng thử lại sau 15 phút.'
);

export const paymentRateLimiter = createRateLimiter(
    5 * 60 * 1000,
    10,
    'Thao tác thanh toán quá nhiều lần. Vui lòng đợi vài phút.'
);

export const uploadRateLimiter = createRateLimiter(
    15 * 60 * 1000,
    20,
    'Tải ảnh quá nhiều lần. Vui lòng đợi 15 phút.'
);
