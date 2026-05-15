import type { FastifyInstance } from 'fastify';

interface RouteEntry {
  path: string;
  methods: string[];
}

export function routesRoute(app: FastifyInstance) {
  app.get<{ Reply: RouteEntry[] }>(
    '/routes',
    {
      schema: {
        disableEncryption: true,
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                methods: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    () => {
      const tree = app.printRoutes({ commonPrefix: false });
      const lines = tree.split('\n');
      const routePattern = /──\s+(\S+)\s+\(([^)]+)\)/;
      const routes: RouteEntry[] = [];
      for (const line of lines) {
        const match = routePattern.exec(line);
        if (match) {
          const path = match[1];
          const methodsRaw = match[2];
          if (path && methodsRaw) {
            routes.push({
              path,
              methods: methodsRaw.split(', '),
            });
          }
        }
      }
      return routes;
    },
  );
}
