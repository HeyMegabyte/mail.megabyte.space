FROM listmonk/listmonk:latest

EXPOSE 9000

CMD ["sh", "-c", "\
  apk add --no-cache postgresql16-client 2>&1 && \
  ./listmonk --install --yes --config '' 2>&1 || true && \
  printf \"UPDATE settings SET value = '\\\"https://mail.megabyte.space\\\"' WHERE key = 'app.root_url';\\n\" > /tmp/fix.sql && \
  PGPASSWORD=$LISTMONK_db__password psql \"sslmode=$LISTMONK_db__ssl_mode host=$LISTMONK_db__host port=$LISTMONK_db__port dbname=$LISTMONK_db__database user=$LISTMONK_db__user\" -f /tmp/fix.sql 2>&1 && \
  ./listmonk --config ''"]
