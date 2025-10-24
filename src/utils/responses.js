const createResponse = (statusCode, message, data) => {
  return {
    status: statusCode,
    message,
    data: data || null,
  };
};

export default createResponse;
