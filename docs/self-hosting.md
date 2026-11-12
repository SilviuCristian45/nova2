# Self-hosting RepLog on a VPS

One `docker-compose.yml` starts everything, including a minimal Supabase (only what the app uses):

| Service | What it is |
| --- | --- |
| `db` | Postgres (`supabase/postgres` image: the roles and extensions Supabase expects) |
| `auth` | GoTrue: sign-up, login, password / e-mail change |
| `rest` | PostgREST: the API over the tables, with RLS |
| `storage` | Storage API: the private `progress-photos` bucket |
| `migrate` | one-shot job: applies `supabase/migrations/*.sql` (base schema first); skips files already applied |
| `app` | RepLog (Next.js standalone) |
| `cron` | calls `/api/drive/cron` every hour (Drive backup) |
| `caddy` | the only public entry point, automatic HTTPS |

Left out on purpose because the app does not use them: Realtime, Studio, edge functions, analytics, imgproxy
(photos are resized in the browser). For a SQL console use `docker compose exec db psql -U postgres`.

Caddy serves `https://DOMAIN/` (the app) and the three Supabase APIs under the same paths hosted Supabase uses
(`/auth/v1`, `/rest/v1`, `/storage/v1`), so `NEXT_PUBLIC_SUPABASE_URL` is simply `https://DOMAIN`. No separate API domain.

## Deploy

1. **VPS**: Docker + Compose, DNS A record of `DOMAIN` pointing at it, ports 80 and 443 open (Caddy needs them for the certificate).
2. **Secrets and config**:
   ```bash
   git clone <repo> && cd nova2
   node scripts/gen-secrets.mjs      # prints POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, DRIVE_TOKEN_KEY, CRON_SECRET
   cp .env.example .env              # paste them in and set DOMAIN
   ```
   `POSTGRES_PASSWORD` is baked into the database volume on first start and the keys are signed with `JWT_SECRET`:
   do not regenerate them later (it would lock you out of the existing data).
3. **Start**: `docker compose up -d --build`. The first start takes a few minutes (image downloads, build, migrations).
   Check with `docker compose ps` (everything `healthy`/`running`, `migrate` exited with 0) and open `https://DOMAIN`.
4. **Create your account** on the login page. Then, if nobody else should register, set `DISABLE_SIGNUP=true` in `.env`
   and run `docker compose up -d`.
5. **Optional**:
   - E-mail (confirmation links): set `SMTP_*` and `MAILER_AUTOCONFIRM=false`. Without SMTP accounts are confirmed immediately.
   - Google Drive backup: fill `GOOGLE_*`, `DRIVE_TOKEN_KEY`, `CRON_SECRET`. The redirect URI must be
     `https://<DOMAIN>/api/drive/callback` (also in Google Cloud Console). The `cron` container does the hourly call.
   - `USDA_API_KEY` for the food search fallback.

## Operations

| Task | Command |
| --- | --- |
| Logs | `docker compose logs -f app` (or `auth`, `rest`, `storage`, `db`) |
| Update | `git pull && docker compose up -d --build` (new migrations are applied automatically) |
| Status | `docker compose ps` |
| SQL console | `docker compose exec db psql -U postgres` |
| Applied migrations | `select * from replog_admin.migrations;` |

**Changing `DOMAIN`, `ANON_KEY` or the scheme** needs a rebuild (`up -d --build`): they are compiled into the browser bundle.

**Backups** (the app itself has no state; all of it is in two volumes):

```bash
docker compose exec -T db pg_dump -U postgres -Fc postgres > replog-$(date +%F).dump
docker run --rm -v nova2_storage_data:/data -v "$PWD":/out alpine tar czf /out/storage-$(date +%F).tgz -C /data .
```

The volume name is `<project>_storage_data` (`docker volume ls`). The in-app JSON export and the Drive backup are
per-user safety nets on top of this, not a replacement.

## Moving the existing data from hosted Supabase

The simplest path is per user, through the app: **Settings → Your data → Download** on the old instance, then
**Import** on the new one. Progress photos are not part of that file; if you use them, restore them from a Google Drive
backup (it includes the photos) on the new instance.

## Using hosted Supabase instead

Run only the app: set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`docker build` the `Dockerfile` with the two public values as `--build-arg`. On an existing hosted project do NOT run
`202610010000_base_schema.sql` (the tables exist; for `db push` use `supabase migration repair --status applied 202610010000`).

## Verifying the migrations without the stack

`bash scripts/verify-migrations.sh` applies the whole chain to a throwaway Postgres with a stub of `auth`/`storage`.

## What was tested

On a local Docker (test domain over plain HTTP): all services healthy, migrations applied from empty, sign-up through
Caddy, profile created by the trigger and readable with the user's JWT (anonymous sees nothing), RPC call, photo
upload + signed URL download, account deletion through the Auth admin API cascading to the data, app reaching Auth
through the public name, re-running `migrate` being a no-op. **Not tested**: real HTTPS certificates (needs a public
domain), SMTP, Google Drive, a browser session end to end, and behaviour under real load.
