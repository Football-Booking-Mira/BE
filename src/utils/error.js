const createError = (statusCode, message) => {
    const error = new Error(message || 'Lỗi server');
    error.statusCode = statusCode || 500;
    return error;
};

export default createError;
