#!/bin/sh
# One-shot job of docker-compose.yml: applies the files in /migrations that are not recorded yet, in name order.
# Runs after Auth and Storage are healthy, because they create auth.users and storage.objects that the migrations use.
set -eu
export PGHOST=db PGUSER=postgres PGDATABASE=postgres
# PGPASSWORD comes from the environment.

psql -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists replog_admin;
create table if not exists replog_admin.migrations (name text primary key, applied_at timestamptz not null default now());
SQL

for f in /migrations/*.sql; do
  name=$(basename "$f")
  if [ "$(psql -At -c "select count(*) from replog_admin.migrations where name = '$name'")" = 0 ]; then
    echo "applying $name"
    psql -v ON_ERROR_STOP=1 -q -f "$f"
    psql -v ON_ERROR_STOP=1 -q -c "insert into replog_admin.migrations (name) values ('$name')"
  fi
done
echo "migrations up to date"
