const winston = require('winston');
const path = require('path');
const util = require('util');

const logDir = path.join(process.cwd(), 'logs');

const formats = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let msg = stack || message;
    if (typeof msg === 'object') {
      msg = util.inspect(msg, { depth: 3, colors: true });
    }
    
    // If there's extra meta data (like requestId from requestLogger), include it
    const metaStr = Object.keys(meta).length ? ` ${util.inspect(meta, { colors: true })}` : '';
    
    return `${timestamp} [${level}]: ${msg}${metaStr}`;
  })
);

const isVercel = process.env.VERCEL === '1';

const transports = [];
const exceptionHandlers = [];
const rejectionHandlers = [];

if (isVercel) {
  // On Vercel, ONLY log to the console to avoid read-only file system errors
  transports.push(new winston.transports.Console({ format: consoleFormat }));
  exceptionHandlers.push(new winston.transports.Console({ format: consoleFormat }));
  rejectionHandlers.push(new winston.transports.Console({ format: consoleFormat }));
} else {
  // Require winston-daily-rotate-file dynamically to avoid issues if not needed
  require('winston-daily-rotate-file');

  transports.push(
    new winston.transports.DailyRotateFile({
      filename:     path.join(logDir, 'error-%DATE%.log'),
      datePattern:  'YYYY-MM-DD',
      level:        'error',
      maxFiles:     '30d',
      maxSize:      '20m',
      zippedArchive: true,
    }),
    new winston.transports.DailyRotateFile({
      filename:     path.join(logDir, 'combined-%DATE%.log'),
      datePattern:  'YYYY-MM-DD',
      maxFiles:     '14d',
      maxSize:      '20m',
      zippedArchive: true,
    })
  );

  exceptionHandlers.push(
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    })
  );

  rejectionHandlers.push(
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    })
  );

  if (process.env.NODE_ENV !== 'production') {
    transports.push(new winston.transports.Console({ format: consoleFormat }));
    exceptionHandlers.push(new winston.transports.Console({ format: consoleFormat }));
    rejectionHandlers.push(new winston.transports.Console({ format: consoleFormat }));
  }
}

const logger = winston.createLogger({
  level:      process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
  format:     formats,
  transports,
  exceptionHandlers,
  rejectionHandlers,
});

module.exports = logger;
