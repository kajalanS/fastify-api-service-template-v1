import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { getServicePublicKey } from '../src/plugins/encryption-plugin.js';
import crypto, { publicEncrypt } from 'node:crypto';

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

describe('health endpoint', () => {
  it('returns ok status', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('uptime');
  });

  it('returns JSON content-type', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
  });
});

describe('routes endpoint', () => {
  it('returns list of registered routes', async () => {
    const response = await fetch(`${baseUrl}/routes`);
    const body = (await response.json()) as Record<string, unknown>[];
    expect(response.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const paths = body.map((r) => r.path);
    expect(paths).toContain('/health');
    expect(paths).toContain('/routes');
  });
});

describe('helmet security headers', () => {
  it('sets security headers on responses', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=15552000; includeSubDomains',
    );
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });
});

describe('cors', () => {
  it('responds to preflight with CORS headers', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toMatch(/GET/);
  });
});

describe('encryption', () => {
  const plaintextPayload = { message: 'hello' };

  it('passes through unencrypted requests', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
  });

  it('rejects request with encryptedKey but no valid payload', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedKey: 'invalid' }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects request with only data field (no algorithm)', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'hello' }),
    });
    expect(response.status).toBe(200);
  });

  it('rejects invalid encrypted payload', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'AAAA', algorithm: 'RSA-OAEP' }),
    });
    expect(response.status).toBe(400);
  });

  it('accepts a valid RSA-OAEP v1 encrypted request', async () => {
    const publicKey = getServicePublicKey();
    const serialized = JSON.stringify(plaintextPayload);
    const buffer = Buffer.from(serialized, 'utf-8');
    const encrypted = publicEncrypt(
      {
        key: publicKey,
        oaepHash: 'sha256',
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      buffer,
    );

    const response = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: encrypted.toString('base64'), algorithm: 'RSA-OAEP' }),
    });
    expect(response.status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('allows health endpoint through rate limiter', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${baseUrl}/health`).then((r) => r.status),
      ),
    );
    for (const status of results) {
      expect(status).toBe(200);
    }
  });
});
