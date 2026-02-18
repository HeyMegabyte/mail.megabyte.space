# Deployment Guide

> Step-by-step instructions for deploying Listmonk on Cloudflare Containers
> with Supabase PostgreSQL.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [First Deployment](#first-deployment)
- [Post-Deployment Verification](#post-deployment-verification)
- [Updating](#updating)
- [Multi-Tenant Deployments](#multi-tenant-deployments)
- [CI/CD Setup](#cicd-setup)
- [Rollback Procedures](#rollback-procedures)
- [Secret Management](#secret-management)

## Prerequisites

### Accounts

| Service | Tier | What you need |
|---|---|---|
| [Cloudflare](https://cloudflare.com/) | Free or Pro | Account ID, API token, domain added |
| [Supabase](https://supabase.com/) | Free or Pro | Project with PostgreSQL database |
| [GitHub](https://github.com/) | Free | Repository access (for CI/CD) |

### Local Tools

| Tool | Version | Install |
|---|---|---|
| Node.js | >= 20.0.0 | `brew install node` or [nodejs.org](https://nodejs.org/) |
| npm | >= 10.0.0 | Bundled with Node.js |
| Docker | Latest | [docker.com](https://www.docker.com/) |
| Wrangler | >= 4.0.0 | Installed via `npm install` |
| Git | >= 2.0.0 | [git-scm.com](https://git-scm.com/) |

### Cloudflare API Token Permissions

Create a Custom Token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) with:

| Permission | Access |
|---|---|
| Account → Workers Scripts | Edit |
| Account → Workers Routes | Edit |
| Zone → DNS | Edit |
| Zone → Workers Routes | Edit |

## Initial Setup

### 1. Create Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com/)
2. Click **New Project**
3. Note down:
   - **Project URL:** `https://xxxxx.supabase.co`
   - **Database Host:** `db.xxxxx.supabase.co`
   - **Database Password:** (save securely)

### 2. Add Domain to Cloudflare

1. Add your domain to Cloudflare (or use an existing one)
2. Ensure DNS is managed by Cloudflare
3. Note your **Account ID** from the dashboard sidebar

### 3. Clone and Configure

```bash
git clone https://github.com/HeyMegabyte/mail.megabyte.space.git
cd mail.megabyte.space
npm install
```

### 4. Update Configuration

Edit `wrangler.jsonc`:

```jsonc
{
  "account_id": "YOUR_ACCOUNT_ID",
  "vars": {
    "APP_DOMAIN": "mail.yourdomain.com",
    "DB_HOST": "db.YOUR_PROJECT_REF.supabase.co",
    "DB_PORT": "5432",
    "DB_USER": "postgres",
    "DB_NAME": "postgres",
    "DB_SSL_MODE": "require",
    "ADMIN_USER": "admin",
    "ADMIN_PASSWORD": "your-admin-password"
  },
  "routes": [
    {
      "pattern": "mail.yourdomain.com",
      "custom_domain": true
    }
  ]
}
```

### 5. Set Secrets

```bash
# Login to Cloudflare
npx wrangler login

# Set database password
npx wrangler secret put DB_PASSWORD
# → Paste your Supabase database password when prompted
```

## First Deployment

```bash
npm run deploy
```

This command:
1. Compiles TypeScript
2. Builds the Docker image locally
3. Uploads the image to Cloudflare's container registry
4. Deploys the Worker and Durable Object
5. Configures the custom domain route

**Expected output:**
```
⛅ wrangler 4.x.x
──────────────────
Total Upload: xx.xx KiB / gzip: xx.xx KiB
Your worker has access to the following bindings:
- Durable Objects: LISTMONK
- Vars: APP_DOMAIN, DB_HOST, DB_PORT, ...
Published listmonk-mail (x.xxs)
  https://mail.yourdomain.com
```

## Post-Deployment Verification

### 1. Health Check

```bash
curl -s https://mail.yourdomain.com/__health | jq .
```

Expected response:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "container": "listmonk",
  "database": "supabase-postgresql",
  "domain": "mail.yourdomain.com",
  "uptime": "running",
  "timestamp": "2026-02-18T..."
}
```

### 2. Version Check

```bash
curl -s https://mail.yourdomain.com/__version | jq .
```

### 3. Admin Panel

Open `https://mail.yourdomain.com/admin` in your browser.

- **Username:** Value of `ADMIN_USER` (default: `admin`)
- **Password:** Value of `ADMIN_PASSWORD`

> The first load may take 10-15 seconds (cold start).

### 4. Live Logs

```bash
npm run logs
```

Watch for container startup messages:
```
[container] Listmonk container started (v2.0.0, domain: mail.yourdomain.com)
```

## Updating

### Update Listmonk Version

```bash
# Redeploy (pulls latest Listmonk image)
npm run deploy
```

The Dockerfile uses `listmonk/listmonk:latest`, so redeploying pulls the newest
version. To pin a specific version:

```dockerfile
FROM listmonk/listmonk:v3.0.0
```

### Update Worker Code

```bash
# Make changes to src/index.ts
# Type check
npm run typecheck
# Deploy
npm run deploy
```

## Multi-Tenant Deployments

### Add a New Environment

1. Add to `wrangler.jsonc`:

```jsonc
{
  "env": {
    "client-acme": {
      "name": "listmonk-acme",
      "vars": {
        "APP_DOMAIN": "mail.acme.com",
        "DB_HOST": "db.ACME_PROJECT.supabase.co",
        "DB_PORT": "5432",
        "DB_USER": "postgres",
        "DB_NAME": "postgres",
        "DB_SSL_MODE": "require",
        "ADMIN_USER": "admin",
        "ADMIN_PASSWORD": "AcmePassword123"
      },
      "routes": [
        { "pattern": "mail.acme.com", "custom_domain": true }
      ]
    }
  }
}
```

2. Set secrets for the environment:

```bash
npx wrangler secret put DB_PASSWORD --env client-acme
```

3. Deploy:

```bash
npx wrangler deploy --env client-acme
```

Each environment gets its own:
- Cloudflare Worker
- Durable Object
- Container instance
- Custom domain route

## CI/CD Setup

### GitHub Actions (Automatic)

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Add these secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Your Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `DB_PASSWORD` | Supabase database password |

3. Push to `main` to trigger automatic deployment.

### Manual Trigger

Go to **Actions** → **Deploy Listmonk to Cloudflare** → **Run workflow**.

Optionally specify an environment name (e.g., `staging`).

## Rollback Procedures

### Quick Rollback (Wrangler)

```bash
# List recent deployments
npx wrangler deployments list

# Rollback to a previous deployment
npx wrangler rollback
```

### Git-Based Rollback

```bash
# Find the last known good commit
git log --oneline

# Checkout and deploy
git checkout <commit-hash>
npm run deploy
```

### Emergency: Disable Worker

```bash
# Delete the worker (stops all traffic)
npx wrangler delete
```

> This removes the route. Re-deploy to bring it back.

## Secret Management

### List Secrets

```bash
npx wrangler secret list
```

### Update a Secret

```bash
npx wrangler secret put DB_PASSWORD
# Paste new password when prompted
```

### Delete a Secret

```bash
npx wrangler secret delete DB_PASSWORD
```

### Secrets in CI/CD

Secrets are set in the GitHub Actions workflow via:

```yaml
postCommands: |
  echo "${{ secrets.DB_PASSWORD }}" | wrangler secret put DB_PASSWORD
```

This runs after every deployment to ensure secrets are always in sync.

## Monitoring Checklist

| Check | Command | Expected |
|---|---|---|
| Worker health | `curl /__health` | `{"status": "healthy"}` |
| Worker version | `curl /__version` | `{"version": "2.0.0"}` |
| Admin panel | Browser → `/admin` | Login page |
| Live logs | `npm run logs` | Log stream |
| Supabase DB | Supabase Dashboard | Tables present |
| DNS | `dig mail.yourdomain.com` | Points to Cloudflare |
