#!/usr/bin/env bash
# Applies supabase/migrations/*.sql, in order, to a throwaway Postgres (Docker) with a Supabase stub,
# then checks that the result has the tables the app needs. Run from the repo root.
set -euo pipefail

name=replog-migrations-check
image=${PG_IMAGE:-postgres:17-alpine}
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
docker rm -f "$name" >/dev/null 2>&1 || true

docker run -d --name "$name" -e POSTGRES_PASSWORD=test "$image" >/dev/null
until docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2

psql() { docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql < supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  psql < "$f"
done

# Every table the app queries must exist, with RLS on.
expected="cardio_sessions daily_checkin daily_steps daily_weight foods google_drive_backups meal_items meal_templates meals offline_sync_receipts profiles progress_photos user_targets workout_drafts workout_sets workouts"
actual=$(psql -At -c "select string_agg(relname, ' ' order by relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'")
[ "$actual" = "$expected" ] || { echo "tables differ:"; echo " expected: $expected"; echo " actual:   $actual"; exit 1; }
no_rls=$(psql -At -c "select string_agg(relname, ' ') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")
[ -z "$no_rls" ] || { echo "RLS missing on: $no_rls"; exit 1; }

# Smoke test: a new user gets a profile, deleting the user cascades.
psql -c "insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001')"
[ "$(psql -At -c "select count(*) from public.profiles")" = 1 ] || { echo "profile trigger did not fire"; exit 1; }
psql -c "delete from auth.users"
[ "$(psql -At -c "select count(*) from public.profiles")" = 0 ] || { echo "profile not removed with the user"; exit 1; }
echo "OK: migrations apply cleanly from an empty database"
