const rateLimit = require('express-rate-limit');
const windowMs  = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const max       = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

const apiLimiter = rateLimit({ windowMs, max,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' } });

// Tracking pixel/click endpoints — high volume, more permissive
const trackingLimiter = rateLimit({ windowMs: 60000, max: 500,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Tracking rate limit exceeded.' } });

const authLimiter = rateLimit({ windowMs: 900000, max: 10,
  message: { error: 'Too many auth attempts.' } });

module.exports = { apiLimiter, trackingLimiter, authLimiter };
