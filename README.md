# Fastify Service Template

**Standalone Fastify 5 microservice template with RSA-OAEP encryption, security plugins, and GitHub Actions CI — ready to scaffold production services in minutes.**

[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)]()
[![pnpm](https://img.shields.io/badge/pnpm-10.8.1-orange)]()
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-blue)]()

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Plugin System](#plugin-system)
- [Encryption](#encryption)
- [API Routes](#api-routes)
- [Service Registration (ISC)](#service-registration-isc)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Related Repositories](#related-repositories)

---

## Features

- **Fastify 5** — ESM + TypeScript strict, hot reload via `tsx watch`
- **RSA-OAEP encryption** — 2048-bit body encryption with `preValidation`/`preHandler` hooks
- **Security headers** — Helmet headers via `preHandler` (avoids `@fastify/helmet` v13 bug)
- **CORS** — Configurable via `@fastify/cors`
- **Rate limiting** — 200 requests/minute per IP via `@fastify/rate-limit` (health endpoint exempted)
- **Structured logging** — Pino with JSON or pretty-print (`pino-pretty`)
- **Zero-dependency dotenv** — Manual `.env` loading in non-production environments
- **ISC integration** — Configurable `GATEWAY_URL` for registration with the API gateway
- **GitHub Actions CI** — `lint` → `typecheck` → `test` on every push/PR
- **Health endpoint** — `GET /health` returns `{"status":"ok","service":"<name>","uptime":<seconds>}`
- **Per-route encryption opt-out** — Declarative `schema.disableEncryption: true`

---

## Quick Start

```bash
pnpm install
pnpm dev
```

The service starts at `http://127.0.0.1:3001` by default.

---

## Configuration

All configuration is via environment variables. Create a `.env` file:

```env
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info
LOG_FORMAT=pretty
SERVICE_NAME=my-service
CORS_ORIGIN=true
GATEWAY_URL=http://localhost:3000
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | `info` | Pino log level |
| `LOG_FORMAT` | `pretty` | `json` or `pretty` |
| `LOG_FILE` | — | File path for log output |
| `SERVICE_NAME` | `my-service` | Service identifier used in health checks and ISC registration |
| `CORS_ORIGIN` | `true` | `true`, `false`, or comma-separated origins |
| `INTERNAL_CALL_HEADER` | `x-internal-call` | Header name for internal routing detection |
| `GATEWAY_URL` | — | API gateway URL for ISC registration (optional) |

---

## Scripts

| Command | Action |
|---|---|
| `pnpm dev` | Start dev server with hot reload (`tsx watch`) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled JavaScript |
| `pnpm lint` | ESLint with flat config + Prettier |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (real HTTP via `fetch`) |
| `pnpm test:watch` | Vitest in watch mode |

---

## Plugin System

Plugins are registered in order in `src/app.ts`:

```
helmet → cors → rate-limit → health route → encryption
```

Encryption is registered last so its hooks wrap all routes.

### Default Plugins

| Plugin | Source | Purpose |
|---|---|---|
| **helmet** | `src/plugins/helmet.ts` | Sets security headers (`X-Content-Type-Options`, `Strict-Transport-Security`, `CSP`, etc.) via `preHandler` |
| **cors** | `src/plugins/cors.ts` | `@fastify/cors` wrapper supporting `true`, `false`, or comma-separated origins |
| **rate-limit** | `src/plugins/rate-limit.ts` | `@fastify/rate-limit` — 200 req/min per IP with `/health` exempted |
| **encryption** | `src/plugins/encryption-plugin.ts` | Global RSA-OAEP body encryption with per-route schema opt-out |

---

## Encryption

Uses **RSA-OAEP** with 2048-bit keys and SHA-256 hashing.

### Hook Placement

```
Request In → preValidation (decrypt body) → Handler → preHandler (encrypt reply via send override) → Response Out
                                                                                    ↓
                                                                             onError (encrypt error payload)
```

### Per-Route Opt-Out

Routes can skip encryption via `schema.disableEncryption: true`:

```typescript
app.get('/health', {
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
  handler: () => ({ status: 'ok', service: 'my-service', uptime: process.uptime() }),
});
```

### Key Generation

Each service instance generates its own RSA key pair on startup. The public key is logged at startup so it can be registered with the gateway for ISC:

```bash
pnpm cli key:generate --out-dir ./keys   # via the API gateway's CLI
```

---

## API Routes

### `GET /health`

Returns service health status. Exempt from encryption and rate limiting.

**Response:**

```json
{
  "status": "ok",
  "service": "my-service",
  "uptime": 1234.56
}
```

---

## Service Registration (ISC)

When running alongside the [Fastify API Gateway](https://github.com/kajalanS/fastify-api-template-v1), services register themselves for inter-service communication:

```bash
POST /internal/register
Content-Type: application/json

{
  "name": "my-service",
  "url": "http://my-service:3001",
  "publicKey": "-----BEGIN PUBLIC KEY-----..."
}
```

The gateway's proxy then routes requests to this service at `/internal/proxy/my-service/*`.

---

## Testing

```bash
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
```

Tests use **real HTTP via `fetch`** on a dynamically assigned port (not `app.inject()`), ensuring the full Fastify lifecycle is exercised.

Test files live in `tests/` and follow the `*.test.ts` convention.

---

## Project Structure

```
service-template/
├── src/
│   ├── index.ts                  # Bootstrap: config → app → listen
│   ├── app.ts                    # Fastify app factory (registers all plugins)
│   ├── config.ts                 # Typed env-based config loader
│   ├── types/index.ts            # Fastify module augmentation, shared types
│   ├── plugins/
│   │   ├── encryption-plugin.ts  # RSA-OAEP encrypt/decrypt hooks
│   │   ├── helmet.ts             # Security headers via preHandler
│   │   ├── cors.ts               # @fastify/cors wrapper
│   │   └── rate-limit.ts         # @fastify/rate-limit wrapper
│   └── routes/
│       └── health.ts             # GET /health
├── tests/
│   └── example.test.ts           # Integration test example
├── .github/workflows/ci.yml      # GitHub Actions CI
├── tsconfig.json                 # TypeScript strict configuration
├── tsconfig.test.json            # Test-specific TypeScript config
├── vitest.config.ts              # Vitest configuration
├── eslint.config.js              # ESLint flat config with Prettier
├── .prettierrc                   # Prettier configuration
├── .gitignore                    # Git ignore patterns
└── package.json                  # Dependencies and scripts
```

---

## Related Repositories

- **[Fastify API Gateway](https://github.com/kajalanS/fastify-api-template-v1)** — The main API gateway project that consumes this template as a Git submodule
