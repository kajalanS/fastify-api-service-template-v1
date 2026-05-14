import type { FastifyInstance } from 'fastify';

interface HealthResponse {
  status: string;
  service: string;
  uptime: number;
}

export function healthRoute(app: FastifyInstance, serviceName: string) {
  app.get<{ Reply: HealthResponse }>(
    '/health',
    {
      schema: {
        disableEncryption: true,
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              uptime: { type: 'number' },
            },
          },
        },
      },
    },
    () => {
      return {
        status: 'ok',
        service: serviceName,
        uptime: process.uptime(),
      };
    },
  );
}
