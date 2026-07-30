import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_ACCESS_EXPIRED, JWT_ACCESS_SECRET } from '../../common/config/environment.js';

export const hashPassword = async (password, saltRounds = 10) => {
    const hashed = await bcrypt.hash(password, saltRounds);
    return hashed;
};

export const generateToken = (payload, exp = '30d') => {
    if (!JWT_ACCESS_SECRET) {
        throw new Error('JWT_ACCESS_SECRET không được cấu hình trong môi trường!');
    }
    const expired = JWT_ACCESS_EXPIRED || exp;
    const token = jwt.sign(payload, JWT_ACCESS_SECRET, {
        algorithm: 'HS256',
        expiresIn: expired,
    });
    return token;
};

export const verifyToken = (token) => {
    if (!JWT_ACCESS_SECRET) {
        throw new Error('JWT_ACCESS_SECRET không được cấu hình trong môi trường!');
    }
    const payload = jwt.verify(token, JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
    });
    return payload;
};
