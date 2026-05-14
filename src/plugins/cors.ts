import type { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import type { AppConfig } from '../config.js';

export function registerCors(app: FastifyInstance, config: AppConfig) {
  const origin =
    config.corsOrigin === 'true'
      ? true
      : config.corsOrigin === 'false'
        ? false
        : config.corsOrigin.split(',').map((o) => o.trim());
  app.register(fastifyCors, {
    origin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Call'],
  });
}
