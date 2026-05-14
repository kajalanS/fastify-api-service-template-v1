import Fastify from 'fastify';
import type { AppConfig } from './config.js';
import { registerHelmet } from './plugins/helmet.js';
import { registerCors } from './plugins/cors.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerEncryptionPlugin } from './plugins/encryption-plugin.js';
import { healthRoute } from './routes/health.js';

export function buildApp(config: AppConfig) {
  const loggerConfig: Record<string, unknown> = {
    level: config.logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-api-key'],
    serializers: {
      req(request: Record<string, unknown>) {
        return {
          method: request.method,
          url: request.url,
          path: request.routeOptions
            ? (request.routeOptions as Record<string, unknown>).url
            : undefined,
        };
      },
    },
  };
  if (config.logFormat === 'pretty') {
    loggerConfig.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss' },
    };
  }
  if (config.logFile) {
    loggerConfig.file = config.logFile;
  }
  const app = Fastify({ logger: loggerConfig });

  registerHelmet(app);
  registerCors(app, config);
  registerRateLimit(app);
  healthRoute(app, config.serviceName);
  registerEncryptionPlugin(app);

  return app;
}
