import Fastify from 'fastify';
import type { AppConfig } from './config.js';
import { registerHelmet } from './plugins/helmet.js';
import { registerCors } from './plugins/cors.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerEncryptionPlugin } from './plugins/encryption-plugin.js';
import { healthRoute } from './routes/health.js';
import { routesRoute } from './routes/routes.js';

export function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      ...(config.logFormat === 'pretty' ? { transport: { target: 'pino-pretty' } } : {}),
    },
  });

  registerHelmet(app);
  registerCors(app, config);
  registerRateLimit(app);

  if (config.apiPrefix) {
    app.register(
      (prefixedApp, _opts, done) => {
        healthRoute(prefixedApp, config.serviceName);
        routesRoute(prefixedApp);
        registerEncryptionPlugin(prefixedApp);
        done();
      },
      { prefix: config.apiPrefix },
    );
  } else {
    healthRoute(app, config.serviceName);
    routesRoute(app);
    registerEncryptionPlugin(app);
  }

  return app;
}
