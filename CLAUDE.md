# CLAUDE.md — Project Intelligence for Claude Code

> This file provides context for Claude Code (and other AI-assisted development
> tools) when working on this repository. It is automatically loaded when a new
> conversation starts.

## Project Overview

**mail.megabyte.space** is a production deployment of [Listmonk](https://listmonk.app/)
— a self-hosted, high-performance newsletter and mailing list manager — running on
**Cloudflare Containers** with **Supabase PostgreSQL** as the database backend.

| Attribute      | Value                                            |
| -------------- | ------------------------------------------------ |
| Live URL       | `https://mail.megabyte.space`                    |
| Health Check   | `https://mail.megabyte.space/__health`           |
| Version Info   | `https://mail.megabyte.space/__version`          |
| Runtime        | Cloudflare Workers + Durable Objects + Containers|
| Database       | Supabase PostgreSQL (TLS required)               |
| Language       | TypeScript (ESNext, strict mode)                 |
| Package Manager| npm                                              |
| Node Version   | >= 20.0.0                                        |
| CI/CD          | GitHub Actions → Wrangler Deploy                 |

## Repository Structure

```
mail.megabyte.space/
├── src/
│   └── index.ts          # Worker + Durable Object (main application logic)
├── docs/
│   ├── ARCHITECTURE.md   # System architecture and design decisions
│   ├── DEPLOYMENT.md     # Deployment guide and runbook
│   └── COMPANION-APPS.md # Guide to companion open-source apps
├── .github/
│   └── workflows/
│       └── deploy.yml    # CI/CD pipeline
├── Dockerfile            # Listmonk container image
├── wrangler.jsonc        # Cloudflare Workers configuration
├── package.json          # Node.js project metadata
├── tsconfig.json         # TypeScript configuration
├── CLAUDE.md             # This file — AI context
├── LICENSE               # MIT License
└── README.md             # Project documentation
```

## Key Architectural Decisions

1. **Single Durable Object Pattern**: All requests route to one Durable Object
   (`listmonk-v11`) which manages a single Listmonk container. This ensures data
   consistency and avoids split-brain issues.

2. **ArrayBuffer Buffering**: Both request and response bodies are fully buffered
   as `ArrayBuffer` before forwarding. This works around a known Durable Object
   runtime limitation where streaming bodies can crash.

3. **Environment Variable Injection**: All Listmonk config is injected via
   `envVars` on the Container class. Listmonk uses `LISTMONK_section__key`
   format (double underscores = TOML nesting).

4. **Database Initialization on Boot**: The container runs `listmonk --install --yes`
   on every start (idempotent) and patches `root_url` via `psql` to ensure the
   domain is always correct.

5. **30-Minute Sleep**: Containers auto-sleep after 30 minutes of inactivity.
   Cold starts take ~10-15 seconds (container boot + DB migration check).

## Development Commands

```bash
# Type check
npm run typecheck

# Local development (requires wrangler login)
npm run dev

# Deploy to production
npm run deploy

# Deploy to staging
npm run deploy:staging

# View live logs
npm run logs

# Check health
npm run health

# Set database password secret
npm run secret:db-password
```

## Environment Variables

### Public Variables (in `wrangler.jsonc`)

| Variable         | Description                      | Default               |
| ---------------- | -------------------------------- | --------------------- |
| `APP_DOMAIN`     | Public domain name               | `mail.megabyte.space` |
| `DB_HOST`        | Supabase PostgreSQL host         | `db.dmlijlffyhibwmmepxhv.supabase.co` |
| `DB_PORT`        | Database port                    | `5432`                |
| `DB_USER`        | Database username                | `postgres`            |
| `DB_NAME`        | Database name                    | `postgres`            |
| `DB_SSL_MODE`    | PostgreSQL SSL mode              | `require`             |
| `ADMIN_USER`     | Listmonk admin username          | `admin`               |
| `ADMIN_PASSWORD` | Listmonk admin password          | (set in config)       |

### Secrets (set via `wrangler secret put`)

| Secret       | Description                          | How to set                        |
| ------------ | ------------------------------------ | --------------------------------- |
| `DB_PASSWORD`| Supabase PostgreSQL password         | `wrangler secret put DB_PASSWORD` |

## Error Codes

The worker returns structured JSON errors. Reference these codes when debugging:

| Code                    | HTTP | Meaning                                    |
| ----------------------- | ---- | ------------------------------------------ |
| `CONTAINER_FETCH_ERROR` | 502  | Container unreachable or returned an error  |
| `CONTAINER_TIMEOUT`     | 504  | Container didn't respond within 30 seconds  |
| `DURABLE_OBJECT_ERROR`  | 503  | Durable Object namespace/stub failure       |

## Common Tasks

### Adding a new environment (multi-tenant)

1. Add an `env` block in `wrangler.jsonc` (see commented examples)
2. Set the `APP_DOMAIN` and database variables
3. Deploy with `npx wrangler deploy --env <name>`
4. Set secrets: `wrangler secret put DB_PASSWORD --env <name>`

### Updating Listmonk version

1. The Dockerfile uses `listmonk/listmonk:latest`
2. To pin a version, change `FROM listmonk/listmonk:latest` to a specific tag
3. Redeploy — the container image will be rebuilt automatically

### Debugging container issues

1. Check logs: `npm run logs` (or `wrangler tail`)
2. Look for `[request-id]` prefixed log lines
3. Hit `/__health` to verify the worker is up (doesn't need the container)
4. Hit `/__version` to check the deployed version

## Testing

Currently this project does not have automated tests. The primary validation is:
- `npm run typecheck` — TypeScript type checking
- `npm run health` — Live health check after deployment
- Manual verification of the Listmonk admin panel

## Coding Conventions

- **TypeScript strict mode** with `noUnusedLocals` and `noUnusedParameters`
- **TypeDoc/JSDoc** on all exports, interfaces, and public methods
- **Structured logging** with `[request-id]` prefix for traceability
- **JSON error responses** with machine-readable error codes
- **`readonly`** on interface properties that shouldn't be mutated
- **`override`** keyword on all Container method overrides
- **No default exports** except the Worker module (required by Cloudflare)

## Related Repositories / Companion Apps

See `docs/COMPANION-APPS.md` for a guide to deploying these alongside Listmonk:

- **Umami** — Privacy-focused web analytics
- **n8n** — Workflow automation
- **Shlink** — URL shortener
- **Wiki.js / Outline** — Knowledge base
- **Hasura** — GraphQL API over Supabase

All follow the same Cloudflare Containers + Supabase PostgreSQL pattern.
