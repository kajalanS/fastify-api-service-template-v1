import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';

function parseDotenv(content: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result.set(key, value);
  }
  return result;
}

function loadDotenv() {
  if (process.env.NODE_ENV === 'production') return;
  const envPath = resolve('.env');
  try {
    const raw = readFileSync(envPath, 'utf-8');
    const parsed = parseDotenv(raw);
    for (const [k, v] of parsed) {
      process.env[k] ??= v;
    }
  } catch {
    // .env file not found — skip silently
  }
}

async function main() {
  loadDotenv();

  const config = loadConfig();
  const app = buildApp(config);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  try {
    const originalLevel = app.log.level;
    app.log.level = 'silent';
    await app.listen({ port: config.port, host: config.host });
    app.log.level = originalLevel;
    app.log.info(`${config.serviceName} ready - http://${config.host}:${String(config.port)}`);
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }
}

void main();
