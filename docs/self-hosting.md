# Self-hosting RepLog on a VPS

Three containers (`docker-compose.yml`): `app` (Next.js standalone), `cron` (hourly Drive-backup trigger),
`caddy` (HTTPS, automatic Let's Encrypt certificate). Supabase (Postgres + Auth + Storage) runs **separately**.

## 1. Supabase

Two options:

- **Keep the hosted project** (supabase.com). Nothing to migrate; skip to step 3.
- **Self-hosted Supabase**: follow <https://supabase.com/docs/guides/self-hosting/docker> (its own compose). Generate
  fresh `JWT_SECRET`, `ANON_KEY` and `SERVICE_ROLE_KEY`, set `SITE_URL` / `API_EXTERNAL_URL` to the public domain,
  and expose the API (Kong, port 8000) over HTTPS (a second Caddy site, e.g. `api.example.com`). The app talks to that
  URL from the browser too, so it must be reachable publicly.

## 2. Database schema (new database only)

Run the files in `supabase/migrations/` **in filename order** in the Supabase SQL Editor (Studio of the self-hosted
instance) or with `psql`. The first one, `202610010000_base_schema.sql`, creates the original tables; the rest evolve them.

> On the existing hosted project the base file must NOT be run (the tables are already there). If you ever want
> `supabase db push` to work there: `supabase migration repair --status applied 202610010000`.

Check the whole chain on a throwaway Postgres (needs Docker): `bash scripts/verify-migrations.sh`.
It uses a stub of Supabase's `auth` / `storage` schemas (`supabase/tests/stub_supabase.sql`), so it proves the SQL is
ordered and consistent, not that a real Supabase accepts it. Always do a first run on the real instance.

The `progress-photos` Storage bucket and its policies are created by migration `202611110001`.

## 3. Configure and start

```bash
cp .env.example .env      # fill it in: DOMAIN, Supabase URL/keys, optional Drive/USDA
docker compose up -d --build
```

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are compiled into the browser bundle:
  after changing them run `docker compose up -d --build` again.
- Point the DNS A record of `DOMAIN` at the VPS and open ports 80/443 first, or Caddy cannot get a certificate.
- Google Drive backup: the redirect URI must be `https://<DOMAIN>/api/drive/callback` (also in Google Cloud Console).
  The `cron` container calls `/api/drive/cron` every hour with `CRON_SECRET`; if the secret is empty the call is rejected.

## 4. Operations

| Task | Command |
| --- | --- |
| Logs | `docker compose logs -f app` |
| Update | `git pull && docker compose up -d --build` |
| Status | `docker compose ps` (the `app` healthcheck calls `/offline`) |

**Backups:** the app has no state of its own; everything lives in Postgres and Storage. Back up the database
(`pg_dump`) and the Storage volume of Supabase. The in-app JSON export and the Drive backup are per-user safety nets,
not a replacement.

## Known gaps

- The Docker image was built and the migration chain was applied on an empty Postgres, but the full stack
  (self-hosted Supabase + app) has not been run end to end yet.
- Supabase self-hosting is a separate compose; there is no single file that starts everything.
- Open Food Facts / USDA / Google are called from the server, so the VPS needs outbound internet.
