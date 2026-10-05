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

  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  console.error(`[Error] ${statusCode} - ${err.message}`);
  if (err.stack && process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
