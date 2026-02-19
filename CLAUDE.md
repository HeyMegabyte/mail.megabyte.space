# CLAUDE.md

## Service: Listmonk
- Deployed to: mail.megabyte.space
- Image: knadh/listmonk:latest
- Port: 9000

## Architecture
This service runs on Cloudflare Workers + Containers with Neon Postgres backing.

## Testing
- E2E tests are in the main loop.megabyte.space repo
- Run `npx playwright test --grep "mail"` from the main repo
