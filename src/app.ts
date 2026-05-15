import Fastify from 'fastify';
import type { AppConfig } from './config.js';
import { registerHelmet } from './plugins/helmet.js';
import { registerCors } from './plugins/cors.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerEncryptionPlugin, createPeerKeyStore } from './plugins/encryption-plugin.js';
import { healthRoute } from './routes/health.js';
import { routesRoute } from './routes/routes.js';

export function buildApp(config: AppConfig) {
  const loggerConfig: Record<string, unknown> = {
    level: config.logLevel,
  };
  if (config.logFormat === 'pretty') {
    loggerConfig.transport = {
      target: 'pino-pretty',
    };
  }
  if (config.logFile) {
    loggerConfig.file = config.logFile;
  }

  const app = Fastify({ logger: loggerConfig });

  registerHelmet(app);
  registerCors(app, config);
  registerRateLimit(app);

  const peerKeyStore = createPeerKeyStore();

  if (config.apiPrefix) {
    app.register(
      (prefixedApp, _opts, done) => {
        healthRoute(prefixedApp, config.serviceName);
        routesRoute(prefixedApp);
        registerEncryptionPlugin(prefixedApp, peerKeyStore);
        done();
      },
      { prefix: config.apiPrefix },
    );
  } else {
    healthRoute(app, config.serviceName);
    routesRoute(app);
    registerEncryptionPlugin(app, peerKeyStore);
  }

  return app;
}
