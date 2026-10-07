const store = require('../utils/store');
const AppError = require('../utils/appError');

/**
 * In production, question and media changes must reach MongoDB. Without a
 * database they would only live in memory and vanish on restart, so refuse
 * them. In development the in-memory/disk fallback is allowed.
 */
function requirePersistentStore(req, res, next) {
  if (process.env.NODE_ENV === 'production' && !store.isDbConnected()) {
    return next(new AppError('Database is not connected; changes to questions and media are disabled', 503));
  }
  next();
}

module.exports = { requirePersistentStore };
