# ─────────────────────────────────────────────────────────────────────────────
# Listmonk on Cloudflare Containers
# ─────────────────────────────────────────────────────────────────────────────
#
# This Dockerfile extends the official Listmonk image for use with
# Cloudflare Containers + Supabase PostgreSQL.
#
# What it does:
#   1. Installs the PostgreSQL 16 client (psql) for database initialization
#   2. Runs `listmonk --install --yes` to set up tables on first boot
#   3. Patches the root_url in the database to match the APP_DOMAIN
#   4. Starts Listmonk in production mode
#
# Environment variables (injected by the Durable Object):
#   LISTMONK_app__root_url   - Public URL (e.g. https://mail.megabyte.space)
#   LISTMONK_db__host        - Supabase PostgreSQL host
#   LISTMONK_db__port        - Database port (5432)
#   LISTMONK_db__user        - Database user
#   LISTMONK_db__password    - Database password
#   LISTMONK_db__database    - Database name
#   LISTMONK_db__ssl_mode    - SSL mode (require)
#
# ─────────────────────────────────────────────────────────────────────────────

FROM listmonk/listmonk:latest

LABEL maintainer="Megabyte Labs <blzalewski@gmail.com>"
LABEL description="Listmonk newsletter manager for Cloudflare Containers"
LABEL org.opencontainers.image.source="https://github.com/HeyMegabyte/mail.megabyte.space"
LABEL org.opencontainers.image.licenses="MIT"

EXPOSE 9000

# Health check — verifies Listmonk is responding on port 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:9000/health || exit 1

CMD ["sh", "-c", "\
  set -e && \
  echo '[init] Installing PostgreSQL client...' && \
  apk add --no-cache postgresql16-client 2>&1 && \
  echo '[init] Running Listmonk database migration...' && \
  ./listmonk --install --yes --config '' 2>&1 || true && \
  echo '[init] Patching root_url in database...' && \
  printf \"UPDATE settings SET value = '\\\"${LISTMONK_app__root_url}\\\"' WHERE key = 'app.root_url';\\n\" > /tmp/fix.sql && \
  PGPASSWORD=$LISTMONK_db__password psql \"sslmode=$LISTMONK_db__ssl_mode host=$LISTMONK_db__host port=$LISTMONK_db__port dbname=$LISTMONK_db__database user=$LISTMONK_db__user\" -f /tmp/fix.sql 2>&1 && \
  echo '[init] Starting Listmonk...' && \
  exec ./listmonk --config ''"]
