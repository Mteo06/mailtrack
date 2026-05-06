const logger = require('../utils/logger');
function errorHandler(err, req, res, _next) {
  logger.error('Unhandled error', { message: err.message, path: req.path });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
}
module.exports = errorHandler;
