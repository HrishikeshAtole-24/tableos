import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    base: { service: 'api' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-session-token"]',
        '*.credentials',
        '*.keySecret',
        '*.webhookSecret',
      ],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } } } : {}),
  });
}
