import winston from 'winston';

const maskSensitiveData = winston.format((info) => {
  const sensitiveKeys = ['password', 'ORACLE_PASSWORD', 'apiKey', 'Authorization'];
  
  if (info.message && typeof info.message === 'object') {
    const maskedMessage = { ...info.message as any };
    sensitiveKeys.forEach(key => {
      if (key in maskedMessage) {
        maskedMessage[key] = '********';
      }
    });
    info.message = maskedMessage as any;
  }
  
  // Also check string messages for common patterns if needed
  if (typeof info.message === 'string') {
    sensitiveKeys.forEach(key => {
      const regex = new RegExp(`("${key}"\\s*:\\s*")[^"]+(")`, 'gi');
      info.message = (info.message as string).replace(regex, `$1********$2`);
    });
  }

  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    maskSensitiveData(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: 'scratch/server.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ],
});

export default logger;
