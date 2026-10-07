function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;

  const response = {
    success: false,
    data: null,
    error: isOperational || process.env.NODE_ENV !== 'production' 
      ? err.message 
      : 'Something went wrong on the server'
  };

  if (process.env.NODE_ENV !== 'production' && statusCode >= 500) {
    response.stack = err.stack;
  }

  // Expected client errors (bad input, auth) get one line; server errors get the stack
  if (statusCode >= 500) {
    console.error(`[Error] ${statusCode} - ${err.message}`);
    if (err.stack && process.env.NODE_ENV !== 'production') console.error(err.stack);
  } else if (process.env.NODE_ENV !== 'test') {
    console.warn(`[Request] ${statusCode} - ${err.message}`);
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
