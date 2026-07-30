import mongoose from 'mongoose';

/**
 * Checks if a value is a valid 24-character hexadecimal MongoDB ObjectId
 */
export const isValidObjectId = (id) => {
    if (!id) return false;
    const str = String(id).trim();
    return mongoose.Types.ObjectId.isValid(str) && /^[0-9a-fA-F]{24}$/.test(str);
};

/**
 * Escape special characters in user input for safe RegExp construction (prevents ReDoS & Regex Injection)
 */
export const sanitizeRegex = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Sanitize query object to prevent NoSQL operator injection ($where, $gt, $ne, $regex, etc.)
 */
export const sanitizeMongoQuery = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(sanitizeMongoQuery);
    }

    const cleanObj = {};
    for (const key of Object.keys(obj)) {
        // Drop any keys starting with $ or containing .
        if (key.startsWith('$') || key.includes('.')) {
            continue;
        }
        cleanObj[key] = typeof obj[key] === 'object' ? sanitizeMongoQuery(obj[key]) : obj[key];
    }
    return cleanObj;
};
