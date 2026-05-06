const { createLogger, format, transports } = require('winston');
module.exports = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production'
    ? format.combine(format.timestamp(), format.json())
    : format.combine(format.colorize(), format.timestamp({ format: 'HH:mm:ss' }), format.simple()),
  transports: [new transports.Console()],
});
