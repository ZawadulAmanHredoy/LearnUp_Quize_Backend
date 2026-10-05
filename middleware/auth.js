const AppError = require('../utils/appError');
const { verifyToken, isAdminPayload, extractBearerToken } = require('../utils/auth');

/**
 * Reject the request unless it carries a valid admin token
 */
function requireAdmin(req, res, next) {
  const decoded = verifyToken(extractBearerToken(req));
  if (!isAdminPayload(decoded)) {
    return next(new AppError('Admin authentication required', 401));
  }
  req.admin = decoded;
  next();
}

/**
 * Attach the admin to the request when a valid admin token is present
 */
function optionalAdmin(req, res, next) {
  const decoded = verifyToken(extractBearerToken(req));
  if (isAdminPayload(decoded)) {
    req.admin = decoded;
  }
  next();
}

module.exports = {
  requireAdmin,
  optionalAdmin
};
