# Fastify Service Template

Template for microservices in the Fastify API Gateway ecosystem.

## Usage

```bash
pnpm install
pnpm dev    # starts on port 3001
```

## Conventions

- Health endpoint: `GET /health`
- Service JWT auth via `X-Service-Token` header
- Encrypted inter-service communication via API gateway
