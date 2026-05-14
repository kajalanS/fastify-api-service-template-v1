import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  const config = loadConfig();
  config.port = 0;
  app = buildApp(config);
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = address;
});

afterAll(async () => {
  await app.close();
});

describe('service', () => {
  it('health endpoint returns ok', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('uptime');
  });

  it('health endpoint returns JSON', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
  });
});
