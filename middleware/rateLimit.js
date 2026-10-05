const AppError = require('../utils/appError');

/**
 * Minimal in-memory fixed-window limiter on failed attempts, keyed by client IP.
 * Team PINs are short, so wrong guesses must be throttled; successful logins
 * (e.g. one rehearsal laptop logging in every team) are not counted.
 */
function rateLimit({ windowMs = 60000, max = 10, message = 'Too many attempts. Please wait a minute.' } = {}) {
  const hits = new Map();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  timer.unref();

  return function rateLimitMiddleware(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    if (entry.count >= max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new AppError(message, 429));
    }

    res.on('finish', () => {
      if (res.statusCode >= 400 && res.statusCode !== 429) {
        entry.count += 1;
      }
    });
    next();
  };
}

module.exports = rateLimit;
