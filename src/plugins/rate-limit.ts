import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';

const EXEMPT_URLS = ['/health'];

export function registerRateLimit(app: FastifyInstance) {
  app.register(fastifyRateLimit, {
    max: 200,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      if (EXEMPT_URLS.includes(request.url)) {
        return '__exempt__';
      }
      return request.ip;
    },
  });
}
