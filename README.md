<p align="center">
  <a href="https://mail.megabyte.space">
    <img src="https://img.shields.io/badge/Listmonk-on_Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Listmonk on Cloudflare" />
  </a>
</p>

<h1 align="center">mail.megabyte.space</h1>

<p align="center">
  <strong>Self-hosted Listmonk newsletter manager running on Cloudflare Containers with Supabase PostgreSQL</strong>
</p>

<p align="center">
  <a href="https://github.com/HeyMegabyte/mail.megabyte.space/actions"><img src="https://img.shields.io/github/actions/workflow/status/HeyMegabyte/mail.megabyte.space/deploy.yml?branch=main&style=flat-square&label=deploy" alt="Deploy Status" /></a>
  <a href="https://mail.megabyte.space/__health"><img src="https://img.shields.io/badge/status-healthy-brightgreen?style=flat-square" alt="Health Status" /></a>
  <a href="https://github.com/HeyMegabyte/mail.megabyte.space/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" /></a>
  <a href="https://listmonk.app/"><img src="https://img.shields.io/badge/listmonk-latest-purple?style=flat-square" alt="Listmonk Version" /></a>
  <img src="https://img.shields.io/badge/runtime-Cloudflare_Containers-F38020?style=flat-square&logo=cloudflare" alt="Cloudflare Containers" />
  <img src="https://img.shields.io/badge/database-Supabase_PostgreSQL-3ECF8E?style=flat-square&logo=supabase" alt="Supabase" />
</p>

---

## Overview

This repository deploys [Listmonk](https://listmonk.app/) — a high-performance, self-hosted newsletter and mailing list manager — on [Cloudflare Containers](https://developers.cloudflare.com/containers/) with [Supabase](https://supabase.com/) PostgreSQL as the backend database.

**Why this stack?**

| Benefit | Description |
|---|---|
| **Zero server management** | Cloudflare Containers handles provisioning, scaling, and TLS |
| **Global edge routing** | Requests are routed through Cloudflare's network (300+ cities) |
| **Auto-sleep** | Container sleeps after 30 minutes of inactivity — pay only for usage |
| **Managed database** | Supabase PostgreSQL with automatic backups, connection pooling, and dashboards |
| **One-command deploy** | `npm run deploy` builds the Docker image and deploys globally |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Cloudflare Edge Network                     │
│                                                                  │
│  ┌─────────────┐    ┌──────────────────┐    ┌────────────────┐  │
│  │   Worker     │───►│  Durable Object  │───►│   Container    │  │
│  │  (Router)    │    │  (Lifecycle Mgr) │    │  (Listmonk)    │  │
│  │             │    │                  │    │  Port 9000     │  │
│  │  /__health  │    │  Sleep: 30min    │    │                │  │
│  │  /__version │    │  Max: 1 instance │    │  Alpine Linux  │  │
│  │  /* proxy   │    │                  │    │  Go binary     │  │
│  └─────────────┘    └──────────────────┘    └───────┬────────┘  │
│                                                      │           │
└──────────────────────────────────────────────────────┼───────────┘
                                                       │ TLS
                                              ┌────────▼────────┐
                                              │    Supabase      │
                                              │   PostgreSQL     │
                                              │                  │
                                              │  ┌────────────┐  │
                                              │  │ subscribers │  │
                                              │  │ campaigns   │  │
                                              │  │ templates   │  │
                                              │  │ lists       │  │
                                              │  │ settings    │  │
                                              │  └────────────┘  │
                                              └─────────────────┘
```

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org/) | >= 20.0.0 | Runtime for Wrangler CLI |
| [Wrangler](https://developers.cloudflare.com/workers/wrangler/) | >= 4.0.0 | Cloudflare deployment tool |
| [Docker](https://www.docker.com/) | Latest | Container image builds |
| [Supabase](https://supabase.com/) account | — | Managed PostgreSQL database |
| [Cloudflare](https://cloudflare.com/) account | — | Workers + Containers runtime |

### 1. Clone and Install

```bash
git clone https://github.com/HeyMegabyte/mail.megabyte.space.git
cd mail.megabyte.space
npm install
```

### 2. Configure

Edit `wrangler.jsonc` with your settings:

```jsonc
{
  "vars": {
    "APP_DOMAIN": "mail.yourdomain.com",      // Your domain
    "DB_HOST": "db.xxxxx.supabase.co",         // Supabase host
    "DB_PORT": "5432",
    "DB_USER": "postgres",
    "DB_NAME": "postgres",
    "DB_SSL_MODE": "require",
    "ADMIN_USER": "admin",
    "ADMIN_PASSWORD": "your-secure-password"
  }
}
```

### 3. Set Secrets

```bash
# Database password (from Supabase dashboard → Settings → Database)
wrangler secret put DB_PASSWORD
```

### 4. Deploy

```bash
npm run deploy
```

Your Listmonk instance will be live at `https://your-domain.com` within minutes.

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_DOMAIN` | Yes | `mail.megabyte.space` | Public-facing domain name |
| `DB_HOST` | Yes | — | Supabase PostgreSQL hostname |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_USER` | No | `postgres` | Database username |
| `DB_NAME` | No | `postgres` | Database name |
| `DB_SSL_MODE` | No | `require` | PostgreSQL SSL mode |
| `DB_PASSWORD` | Yes | — | Database password (**set as secret**) |
| `ADMIN_USER` | No | `admin` | Listmonk admin username |
| `ADMIN_PASSWORD` | Yes | — | Listmonk admin password |

### Container Settings

| Setting | Value | Description |
|---|---|---|
| Container Port | `9000` | Listmonk's HTTP server port |
| Sleep After | `30 minutes` | Auto-sleep after inactivity |
| Max Instances | `1` | Single container (Durable Object) |
| Instance Type | `standard-1` | Cloudflare container tier |
| Internet Access | `true` | Required for SMTP + database |
| DB Pool (open) | `25` | Max open PostgreSQL connections |
| DB Pool (idle) | `25` | Max idle PostgreSQL connections |
| DB Pool (lifetime) | `300s` | Max connection lifetime |

### API Endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/__health` | GET | None | Health check (bypasses container) |
| `/__version` | GET | None | Deployed version information |
| `/admin` | GET | Basic Auth | Listmonk admin dashboard |
| `/api/*` | Various | API Key | Listmonk REST API |

## Multi-Tenant Deployment

Deploy separate instances for different domains or environments:

```jsonc
// In wrangler.jsonc, add an "env" block:
{
  "env": {
    "staging": {
      "name": "listmonk-mail-staging",
      "vars": {
        "APP_DOMAIN": "mail-staging.megabyte.space",
        "DB_HOST": "db.YOUR_STAGING_PROJECT.supabase.co"
        // ... other vars
      },
      "routes": [
        { "pattern": "mail-staging.megabyte.space", "custom_domain": true }
      ]
    }
  }
}
```

Deploy with:

```bash
npm run deploy:staging
# or: npx wrangler deploy --env staging
```

## Observability

### Live Logs

```bash
# Production logs
npm run logs

# Staging logs
npm run logs:staging
```

### Structured Log Format

All log entries include request IDs for correlation:

```
[a1b2c3d4e5f6] GET /admin — forwarding to container
[a1b2c3d4e5f6] GET /admin — 200 (145ms)
```

### Error Responses

Errors return structured JSON with machine-readable codes:

```json
{
  "error": "Container request timed out",
  "code": "CONTAINER_TIMEOUT",
  "request_id": "a1b2c3d4e5f6",
  "timestamp": "2026-02-18T10:30:00.000Z",
  "version": "2.1.0"
}
```

| Error Code | HTTP Status | Cause |
|---|---|---|
| `CONTAINER_FETCH_ERROR` | 502 | Container unreachable or internal error |
| `CONTAINER_TIMEOUT` | 504 | No response within 30 seconds |
| `DURABLE_OBJECT_ERROR` | 503 | Durable Object routing failure |

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically:

1. Checks out the code
2. Installs Node.js 22 and dependencies
3. Sets up Docker Buildx for container builds
4. Runs TypeScript type checking
5. Deploys to Cloudflare via Wrangler
6. Sets the `DB_PASSWORD` secret

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers + DNS permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `DB_PASSWORD` | Supabase PostgreSQL password |

### Manual Deployment

Trigger a manual deployment from the GitHub Actions tab with an optional
environment parameter (e.g., `staging`).

## Companion Apps

This same Cloudflare Containers + Supabase pattern works for many other
open-source applications. See [docs/COMPANION-APPS.md](docs/COMPANION-APPS.md)
for a complete guide.

**Best companions for Listmonk:**

| App | Category | Why |
|---|---|---|
| [Umami](https://umami.is/) | Analytics | Track newsletter campaign clicks |
| [n8n](https://n8n.io/) | Automation | Automate subscriber workflows |
| [Shlink](https://shlink.io/) | URL Shortener | Short links in newsletters with tracking |
| [Hasura](https://hasura.io/) | GraphQL | API layer over your Supabase data |

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Local development
npm run dev

# Check health of live deployment
npm run health

# View deployed version
npm run version
```

## Project Structure

```
.
├── src/
│   └── index.ts            # 310 lines — Worker + Durable Object + Container
├── docs/
│   ├── ARCHITECTURE.md     # Deep dive into system design
│   ├── DEPLOYMENT.md       # Step-by-step deployment runbook
│   └── COMPANION-APPS.md   # Other apps for this stack
├── .github/
│   └── workflows/
│       └── deploy.yml      # CI/CD pipeline
├── Dockerfile              # Listmonk container with PostgreSQL client
├── wrangler.jsonc          # Cloudflare Workers configuration
├── package.json            # Project metadata and scripts
├── tsconfig.json           # TypeScript strict configuration
├── CLAUDE.md               # AI development context
├── LICENSE                 # MIT License
└── README.md               # This file
```

## Troubleshooting

<details>
<summary><strong>Container takes a long time to start</strong></summary>

Cold starts take 10-15 seconds because the container must:
1. Boot the Alpine Linux image
2. Install `postgresql16-client` via apk
3. Run `listmonk --install --yes` (idempotent migration)
4. Patch the `root_url` setting in the database
5. Start the Listmonk Go binary

The container stays warm for 30 minutes after the last request.
</details>

<details>
<summary><strong>502 Bad Gateway errors</strong></summary>

This usually means the container failed to start. Check:
1. `npm run logs` for container error messages
2. Verify your Supabase database is reachable and credentials are correct
3. Ensure `DB_PASSWORD` is set: `wrangler secret list`
4. Try redeploying: `npm run deploy`
</details>

<details>
<summary><strong>Database connection refused</strong></summary>

1. Check Supabase dashboard — is the project paused?
2. Verify `DB_HOST` matches your Supabase project
3. Ensure `DB_SSL_MODE` is set to `require`
4. Check that Supabase network restrictions allow Cloudflare IPs
</details>

<details>
<summary><strong>Admin panel shows wrong URL</strong></summary>

The Dockerfile patches `root_url` on every boot. If it's still wrong:
1. Check `APP_DOMAIN` in `wrangler.jsonc`
2. The SQL patch runs: `UPDATE settings SET value = '"https://APP_DOMAIN"' WHERE key = 'app.root_url'`
3. Redeploy to trigger the patch again
</details>

## License

[MIT](LICENSE) — Megabyte Labs

---

<p align="center">
  <sub>Built with Cloudflare Containers + Supabase PostgreSQL</sub><br/>
  <sub>Deployed at <a href="https://mail.megabyte.space">mail.megabyte.space</a></sub>
</p>
