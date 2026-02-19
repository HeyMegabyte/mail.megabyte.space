# ─────────────────────────────────────────────────────────────────────────────
# Listmonk on Cloudflare Containers
# ─────────────────────────────────────────────────────────────────────────────
#
# This Dockerfile extends the official Listmonk image for use with
# Cloudflare Containers + Neon PostgreSQL (direct endpoint).
#
# What it does:
#   1. Runs `listmonk --install --yes` to set up tables on first boot
#   2. Starts Listmonk in production mode
#
# Environment variables (injected by the Durable Object):
#   LISTMONK_app__root_url   - Public URL (e.g. https://mail.megabyte.space)
#   LISTMONK_db__host        - Neon PostgreSQL direct host (not pooler)
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
  echo '[init] Connecting to Neon PostgreSQL (direct endpoint)...' && \
  echo '[init] DB_HOST='\"$LISTMONK_db__host\" && \
  echo '[init] DB_USER='\"$LISTMONK_db__user\" && \
  echo '[init] DB_NAME='\"$LISTMONK_db__database\" && \
  echo '[init] Running database migration (idempotent)...' && \
  ./listmonk --install --yes --config '' 2>&1; \
  echo '[init] Migration exit code: '$? && \
  echo '[init] Starting Listmonk...' && \
  exec ./listmonk --config ''"]
