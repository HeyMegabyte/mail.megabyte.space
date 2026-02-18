# Architecture

> Deep dive into the system design of mail.megabyte.space — Listmonk on
> Cloudflare Containers with Supabase PostgreSQL.

## System Overview

```
                           ┌─────────────────────────┐
                           │    DNS: Cloudflare       │
                           │    mail.megabyte.space    │
                           └────────────┬────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────┐
│                     Cloudflare Edge (300+ PoPs)                   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Worker (src/index.ts)                     │  │
│  │                                                             │  │
│  │  ┌──────────┐   ┌──────────────┐   ┌────────────────────┐  │  │
│  │  │ /__health│   │ /__version   │   │   /* (all other)   │  │  │
│  │  │ Direct   │   │ Direct       │   │   Proxy to DO      │  │  │
│  │  │ Response │   │ Response     │   │                    │  │  │
│  │  └──────────┘   └──────────────┘   └────────┬───────────┘  │  │
│  │                                              │              │  │
│  └──────────────────────────────────────────────┼──────────────┘  │
│                                                  │                 │
│  ┌──────────────────────────────────────────────▼──────────────┐  │
│  │              Durable Object (ListmonkContainer)             │  │
│  │                                                             │  │
│  │  Responsibilities:                                          │  │
│  │  • Manage container lifecycle (start/stop/sleep)            │  │
│  │  • Buffer request/response bodies (ArrayBuffer)             │  │
│  │  • Inject environment variables into container              │  │
│  │  • 30-minute sleep timer                                    │  │
│  │  • Request ID generation and structured logging             │  │
│  │  • Timeout protection (30s per request)                     │  │
│  │                                                             │  │
│  └──────────────────────────────────────────────┬──────────────┘  │
│                                                  │                 │
│  ┌──────────────────────────────────────────────▼──────────────┐  │
│  │                Docker Container (Listmonk)                  │  │
│  │                                                             │  │
│  │  Base Image: listmonk/listmonk:latest (Alpine)              │  │
│  │  Port: 9000                                                 │  │
│  │  Added: postgresql16-client (for DB init)                   │  │
│  │                                                             │  │
│  │  Boot sequence:                                             │  │
│  │  1. apk add postgresql16-client                             │  │
│  │  2. ./listmonk --install --yes (idempotent migration)       │  │
│  │  3. psql: UPDATE root_url to match APP_DOMAIN               │  │
│  │  4. exec ./listmonk --config ''                             │  │
│  │                                                             │  │
│  └──────────────────────────────────────────────┬──────────────┘  │
│                                                  │                 │
└──────────────────────────────────────────────────┼─────────────────┘
                                                   │ TLS (port 5432)
                                          ┌────────▼────────┐
                                          │    Supabase      │
                                          │  PostgreSQL 15   │
                                          │                  │
                                          │  Tables:         │
                                          │  • subscribers   │
                                          │  • lists         │
                                          │  • campaigns     │
                                          │  • templates     │
                                          │  • settings      │
                                          │  • media         │
                                          │  • bounces       │
                                          └─────────────────┘
```

## Component Details

### 1. Worker (Edge Router)

**File:** `src/index.ts` (default export)

The Worker runs on every Cloudflare edge PoP and acts as a lightweight router:

| Path | Handler | Container Required |
|---|---|---|
| `/__health` | Direct JSON response | No |
| `/__version` | Direct JSON response | No |
| `/*` | Proxy to Durable Object | Yes |

**Design decision:** Health and version endpoints bypass the container entirely.
This means monitoring tools can verify the Worker is deployed without triggering
a cold start.

### 2. Durable Object (Container Lifecycle Manager)

**File:** `src/index.ts` (`ListmonkContainer` class)

The Durable Object is a singleton (one instance per deployment) that:

1. **Starts the container** on the first request
2. **Proxies HTTP** to the container on port 9000
3. **Sleeps the container** after 30 minutes of inactivity
4. **Restarts on demand** when the next request arrives

#### Why ArrayBuffer Buffering?

The Durable Object runtime has a known issue with streaming `ReadableStream`
bodies. When a request body is forwarded as a stream, the runtime may crash with
an internal error. The workaround:

```typescript
// Buffer request body before forwarding
let bodyContent: ArrayBuffer | null = null;
if (request.body) {
  bodyContent = await request.arrayBuffer();
}
```

This adds latency for large request bodies (e.g., file uploads to Listmonk's
media manager) but prevents crashes.

#### Request ID Tracing

Every request gets a 12-character hex ID generated from `crypto.randomUUID()`.
This ID appears in:
- Console logs: `[a1b2c3d4e5f6] GET /admin — 200 (145ms)`
- Response headers: `X-Request-Id: a1b2c3d4e5f6`
- Error responses: `"request_id": "a1b2c3d4e5f6"`

### 3. Docker Container (Listmonk)

**File:** `Dockerfile`

The container is based on the official `listmonk/listmonk:latest` Alpine image
with two additions:

1. **PostgreSQL 16 client** (`apk add postgresql16-client`) — needed to run
   the `root_url` patch via `psql`
2. **Boot script** — runs migration, patches settings, starts Listmonk

#### Boot Sequence Timing

| Step | Duration | Notes |
|---|---|---|
| Container start | ~2s | Cloudflare provisions the instance |
| `apk add postgresql16-client` | ~3-5s | Downloads and installs package |
| `listmonk --install --yes` | ~2-3s | Idempotent — skips if tables exist |
| `psql` root_url patch | ~1s | Single UPDATE query |
| Listmonk startup | ~1-2s | Go binary, fast startup |
| **Total cold start** | **~10-15s** | Subsequent requests: <100ms |

### 4. Database (Supabase PostgreSQL)

Supabase provides a managed PostgreSQL 15 instance with:

| Feature | Value |
|---|---|
| Connection pooling | PgBouncer (transaction mode) |
| SSL/TLS | Required (`DB_SSL_MODE=require`) |
| Backups | Automatic daily (7-day retention on free tier) |
| Dashboard | SQL editor, table viewer, logs |
| Direct connection | `db.PROJECT_REF.supabase.co:5432` |

#### Connection Pool Settings

The Worker configures Listmonk with:

```
max_open:     25  connections
max_idle:     25  connections
max_lifetime: 300s (5 minutes)
```

These values are tuned for Supabase's default connection limits. Supabase free
tier allows 60 direct connections. With `max_open=25`, Listmonk uses at most
~42% of the available pool.

## Error Handling Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Container (ListmonkContainer.fetch)            │
│                                                         │
│  Try:                                                   │
│    1. Buffer request body (ArrayBuffer)                  │
│    2. containerFetch() with AbortController timeout      │
│    3. Buffer response body (ArrayBuffer)                 │
│    4. Augment headers (request ID, security, version)    │
│                                                         │
│  Catch AbortError → 504 CONTAINER_TIMEOUT               │
│  Catch other     → 502 CONTAINER_FETCH_ERROR            │
└──────────────────────────────┬──────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────┐
│ Layer 2: Worker (default.fetch)                         │
│                                                         │
│  Try:                                                   │
│    1. Get Durable Object stub                           │
│    2. Forward request to stub                           │
│                                                         │
│  Catch → 503 DURABLE_OBJECT_ERROR                       │
└─────────────────────────────────────────────────────────┘
```

All error responses are structured JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "request_id": "a1b2c3d4e5f6",
  "timestamp": "2026-02-18T10:30:00.000Z",
  "version": "2.1.0"
}
```

## Security Measures

| Measure | Implementation |
|---|---|
| TLS (transit) | Cloudflare edge terminates TLS; DB connection uses `sslmode=require` |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` |
| Admin auth | Listmonk's built-in Basic Auth for `/admin` |
| DB credentials | `DB_PASSWORD` stored as Wrangler secret (encrypted at rest) |
| No direct DB access | Container connects via Supabase's TLS endpoint |

## Cost Model

| Component | Free Tier | Paid |
|---|---|---|
| Cloudflare Workers | 100K requests/day | $5/mo (10M requests) |
| Cloudflare Containers | Beta (currently free) | TBD (billing by uptime) |
| Supabase PostgreSQL | 500MB storage, 2 GB transfer | $25/mo (8GB, 50GB transfer) |
| **Total** | **$0/mo** (within limits) | **~$30/mo** |

## Design Tradeoffs

| Decision | Benefit | Tradeoff |
|---|---|---|
| Single container | Data consistency, simple routing | No horizontal scaling |
| 30-min sleep | Cost savings | Cold start latency |
| ArrayBuffer buffering | Prevents DO runtime crashes | Memory usage for large uploads |
| `latest` Docker tag | Always up-to-date | Non-reproducible builds |
| psql in container | Dynamic root_url patching | Larger image, slower boot |
| Supabase (external DB) | Managed backups, dashboard | Network latency, vendor dependency |
