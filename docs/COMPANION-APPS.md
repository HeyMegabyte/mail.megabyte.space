# Companion Apps Guide

> Open-source web applications that can be deployed alongside Listmonk using
> the same **Cloudflare Containers + Neon PostgreSQL** pattern.

## Overview

The architecture used for Listmonk — a Cloudflare Worker proxying to a Docker
container backed by Neon PostgreSQL — is a repeatable pattern. Any
application that meets these criteria can be deployed the same way:

| Requirement | Why |
|---|---|
| Has a Docker image | Cloudflare Containers run Docker images |
| Supports PostgreSQL | Neon provides managed PostgreSQL |
| Single-process friendly | Cloudflare Containers run one container per Durable Object |
| Reasonable resource usage | `standard-1` instance has limited CPU/RAM |
| Configurable via environment | Container env vars are injected by the Worker |

## Tier 1: Perfect Fit (Lightweight, PostgreSQL-Native)

These apps are lightweight, PostgreSQL-native, and deploy identically to Listmonk.

### Umami — Web Analytics

> Privacy-focused Google Analytics alternative. Ideal companion for tracking
> newsletter campaign clicks.

| Attribute | Value |
|---|---|
| Image | `ghcr.io/umami-software/umami:postgresql-latest` |
| Port | `3000` |
| Database | PostgreSQL (native) |
| Memory | ~100MB |
| CPU | Minimal |
| Website | [umami.is](https://umami.is/) |
| GitHub | [umami-software/umami](https://github.com/umami-software/umami) |

**Environment variables:**
```
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxx-pooler.region.aws.neon.tech:5432/neondb?sslmode=require
```

**Synergy with Listmonk:** Add Umami tracking script to your newsletter templates
to measure open rates and click-through without relying on third-party analytics.

---

### Shlink — URL Shortener

> Self-hosted URL shortener with analytics. Create trackable short links for
> newsletter campaigns.

| Attribute | Value |
|---|---|
| Image | `shlinkio/shlink:stable` |
| Port | `8080` |
| Database | PostgreSQL (native) |
| Memory | ~80MB |
| CPU | Minimal |
| Website | [shlink.io](https://shlink.io/) |
| GitHub | [shlinkio/shlink](https://github.com/shlinkio/shlink) |

**Environment variables:**
```
DEFAULT_DOMAIN=s.megabyte.space
IS_HTTPS_ENABLED=true
DB_DRIVER=postgres
DB_HOST=ep-xxx-pooler.region.aws.neon.tech
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=xxx
```

**Synergy with Listmonk:** Use Shlink to create branded short links
(`s.megabyte.space/xyz`) in your newsletters for click tracking.

---

### Planka — Kanban Board

> Trello-like project management. Track newsletter campaigns and content
> planning.

| Attribute | Value |
|---|---|
| Image | `ghcr.io/plankanban/planka:latest` |
| Port | `1337` |
| Database | PostgreSQL (native) |
| Memory | ~150MB |
| CPU | Minimal |
| Website | [planka.app](https://planka.app/) |
| GitHub | [plankanban/planka](https://github.com/plankanban/planka) |

**Environment variables:**
```
BASE_URL=https://board.megabyte.space
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxx-pooler.region.aws.neon.tech:5432/neondb?sslmode=require
SECRET_KEY=your-secret-key
DEFAULT_ADMIN_EMAIL=admin@megabyte.space
DEFAULT_ADMIN_PASSWORD=xxx
DEFAULT_ADMIN_NAME=Admin
DEFAULT_ADMIN_USERNAME=admin
```

---

## Tier 2: Great Fit (Moderate Resources)

These apps work well but may use more resources or have additional requirements.

### n8n — Workflow Automation

> Zapier/Make alternative. Automate subscriber workflows, welcome sequences,
> and integrations.

| Attribute | Value |
|---|---|
| Image | `n8nio/n8n:latest` |
| Port | `5678` |
| Database | PostgreSQL (supported) |
| Memory | ~200MB |
| CPU | Moderate (workflow execution) |
| Website | [n8n.io](https://n8n.io/) |
| GitHub | [n8n-io/n8n](https://github.com/n8n-io/n8n) |

**Environment variables:**
```
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=ep-xxx-pooler.region.aws.neon.tech
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=postgres
DB_POSTGRESDB_USER=postgres
DB_POSTGRESDB_PASSWORD=xxx
DB_POSTGRESDB_SSL_ENABLED=true
N8N_HOST=auto.megabyte.space
N8N_PORT=5678
N8N_PROTOCOL=https
WEBHOOK_URL=https://auto.megabyte.space/
```

**Synergy with Listmonk:** Automate subscriber onboarding — when someone
subscribes via Listmonk, trigger an n8n workflow that sends a welcome email,
adds them to a CRM, or notifies your team.

---

### Wiki.js — Knowledge Base

> Beautiful, modern wiki. Document your newsletter processes, editorial
> guidelines, and internal knowledge.

| Attribute | Value |
|---|---|
| Image | `ghcr.io/requarks/wiki:2` |
| Port | `3000` |
| Database | PostgreSQL (native) |
| Memory | ~200MB |
| CPU | Low |
| Website | [js.wiki](https://js.wiki/) |
| GitHub | [requarks/wiki](https://github.com/requarks/wiki) |

**Environment variables:**
```
DB_TYPE=postgres
DB_HOST=ep-xxx-pooler.region.aws.neon.tech
DB_PORT=5432
DB_USER=postgres
DB_PASS=xxx
DB_NAME=postgres
DB_SSL=true
```

---

### Outline — Team Docs

> Notion-like collaborative documents. Requires S3-compatible storage
> (use Cloudflare R2).

| Attribute | Value |
|---|---|
| Image | `outlinewiki/outline:latest` |
| Port | `3000` |
| Database | PostgreSQL + Redis + S3 |
| Memory | ~300MB |
| CPU | Moderate |
| Website | [getoutline.com](https://getoutline.com/) |
| GitHub | [outline/outline](https://github.com/outline/outline) |

**Note:** Outline also requires Redis and S3. You'd need to pair it with
Cloudflare R2 (S3-compatible) and either a Redis container or Upstash Redis.

---

### Directus — Headless CMS

> Instant REST + GraphQL API on top of any PostgreSQL schema. Great for building
> custom frontends for your subscriber data.

| Attribute | Value |
|---|---|
| Image | `directus/directus:latest` |
| Port | `8055` |
| Database | PostgreSQL (native) |
| Memory | ~200MB |
| CPU | Low-Moderate |
| Website | [directus.io](https://directus.io/) |
| GitHub | [directus/directus](https://github.com/directus/directus) |

**Environment variables:**
```
DB_CLIENT=pg
DB_HOST=ep-xxx-pooler.region.aws.neon.tech
DB_PORT=5432
DB_DATABASE=postgres
DB_USER=postgres
DB_PASSWORD=xxx
DB_SSL__REJECT_UNAUTHORIZED=false
ADMIN_EMAIL=admin@megabyte.space
ADMIN_PASSWORD=xxx
```

---

### Hasura — GraphQL Engine

> Instant GraphQL API over your existing Neon PostgreSQL tables. Zero code.

| Attribute | Value |
|---|---|
| Image | `hasura/graphql-engine:latest` |
| Port | `8080` |
| Database | PostgreSQL (native, real-time) |
| Memory | ~150MB |
| CPU | Low |
| Website | [hasura.io](https://hasura.io/) |
| GitHub | [hasura/graphql-engine](https://github.com/hasura/graphql-engine) |

**Environment variables:**
```
HASURA_GRAPHQL_DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxx-pooler.region.aws.neon.tech:5432/neondb?sslmode=require
HASURA_GRAPHQL_ENABLE_CONSOLE=true
HASURA_GRAPHQL_ADMIN_SECRET=your-admin-secret
```

**Synergy with Listmonk:** Expose Listmonk's subscriber data via a GraphQL API
for custom dashboards, mobile apps, or frontend integrations.

---

## Tier 3: Works But Heavier

These apps are functional but push the limits of `standard-1` containers.

### Gitea — Git Hosting

| Attribute | Value |
|---|---|
| Image | `gitea/gitea:latest` |
| Port | `3000` |
| Database | PostgreSQL |
| Memory | ~200-400MB |
| GitHub | [go-gitea/gitea](https://github.com/go-gitea/gitea) |

### Mattermost — Team Chat

| Attribute | Value |
|---|---|
| Image | `mattermost/mattermost-team-edition:latest` |
| Port | `8065` |
| Database | PostgreSQL |
| Memory | ~300-500MB |
| GitHub | [mattermost/mattermost](https://github.com/mattermost/mattermost) |

### Keycloak — Identity/SSO

| Attribute | Value |
|---|---|
| Image | `quay.io/keycloak/keycloak:latest` |
| Port | `8080` |
| Database | PostgreSQL |
| Memory | ~500MB+ (Java) |
| GitHub | [keycloak/keycloak](https://github.com/keycloak/keycloak) |

### Windmill — Developer Automation

| Attribute | Value |
|---|---|
| Image | `ghcr.io/windmill-labs/windmill:main` |
| Port | `8000` |
| Database | PostgreSQL |
| Memory | ~200-400MB |
| GitHub | [windmill-labs/windmill](https://github.com/windmill-labs/windmill) |

### Formbricks — Surveys/Forms

| Attribute | Value |
|---|---|
| Image | `ghcr.io/formbricks/formbricks:latest` |
| Port | `3000` |
| Database | PostgreSQL |
| Memory | ~200MB |
| GitHub | [formbricks/formbricks](https://github.com/formbricks/formbricks) |

## Won't Work on This Stack

These popular apps **cannot** use this pattern:

| App | Reason |
|---|---|
| WordPress | MySQL only |
| Ghost | MySQL only |
| BookStack | MySQL only |
| Rocket.Chat | MongoDB only |
| Plausible Analytics | Requires ClickHouse |
| PostHog | Requires ClickHouse + Redis + Kafka |
| GitLab | Too resource-heavy for standard-1 |
| Nextcloud | Requires persistent local disk |
| Mastodon | Too resource-heavy, requires Redis + Sidekiq |

## Template: Adding a New App

To deploy any of the above, copy the Listmonk structure:

### 1. Create a new repository

```bash
mkdir my-app.megabyte.space && cd my-app.megabyte.space
npm init -y
npm install @cloudflare/containers
npm install -D @cloudflare/workers-types typescript wrangler
```

### 2. Create `src/index.ts`

```typescript
import { Container } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

interface Env {
  MY_APP: DurableObjectNamespace;
  APP_DOMAIN: string;
  DATABASE_URL: string;
}

export class MyAppContainer extends Container<Env> {
  defaultPort = 3000;  // Change to your app's port
  sleepAfter = "30m";
  enableInternet = true;
  envVars = {
    DATABASE_URL: (env as unknown as Env).DATABASE_URL,
    // Add your app-specific env vars here
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.MY_APP.idFromName("my-app-v1");
    const stub = env.MY_APP.get(id);
    return await stub.fetch(request);
  },
};
```

### 3. Create `Dockerfile`

```dockerfile
FROM your-app/image:latest
EXPOSE 3000
# Add any initialization commands
CMD ["your-app", "start"]
```

### 4. Create `wrangler.jsonc`

```jsonc
{
  "name": "my-app",
  "main": "src/index.ts",
  "compatibility_date": "2025-04-03",
  "account_id": "YOUR_ACCOUNT_ID",
  "containers": [{
    "class_name": "MyAppContainer",
    "image": "./Dockerfile",
    "max_instances": 1,
    "instance_type": "standard-1"
  }],
  "durable_objects": {
    "bindings": [{ "class_name": "MyAppContainer", "name": "MY_APP" }]
  },
  "migrations": [{ "new_sqlite_classes": ["MyAppContainer"], "tag": "v1" }],
  "vars": {
    "APP_DOMAIN": "myapp.megabyte.space",
    "DATABASE_URL": "postgresql://neondb_owner:xxx@ep-xxx-pooler.region.aws.neon.tech:5432/neondb?sslmode=require"
  },
  "routes": [{ "pattern": "myapp.megabyte.space", "custom_domain": true }]
}
```

### 5. Deploy

```bash
npx wrangler deploy
```

## Shared Database Considerations

You can share a single Neon PostgreSQL instance across multiple apps.
Each app typically creates its own tables with unique prefixes:

| App | Table Prefix | Example Tables |
|---|---|---|
| Listmonk | `lists`, `campaigns`, etc. | `subscribers`, `campaigns`, `templates` |
| Umami | `umami_` | `umami_website`, `umami_session` |
| n8n | `n8n_` | `n8n_workflow`, `n8n_execution` |
| Wiki.js | `wiki_` | `wiki_pages`, `wiki_users` |
| Hasura | `hdb_` | `hdb_catalog`, `hdb_metadata` |

**Tip:** Use separate Neon schemas for each app to avoid table name conflicts:

```sql
CREATE SCHEMA umami;
CREATE SCHEMA n8n;
-- Then set PGOPTIONS='-c search_path=umami' in the container env
```

Or use separate Neon projects for complete isolation (recommended for
production).
