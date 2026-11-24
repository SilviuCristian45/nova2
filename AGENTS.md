<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# RepLog (`nova2`) — Project Agent Guide

RepLog is a bilingual (`ro` / `en`) fitness and nutrition PWA for tracking strength & cardio workouts, sets, personal records, plateaus, meals/macros, barcode foods, daily steps, body weight, daily check-ins, and progress photos, with offline queuing and automatic Google Drive backups.

## Communication & Language Conventions

- **User communication**: Respond to the user in **Romanian**.
- **Codebase**: Write code, identifiers, commit-ready strings, and comments in **English**.
- **UI copy**: All user-facing text must be bilingual (`ro` / `en`).
  - Server components/actions: `const { t, language, locale } = await getLanguage()` (`app/language.ts`).
  - Client components: `useLanguage()` (`t(ro, en)`) or `<Text ro="..." en="..." />` (`app/components/language-provider.tsx`).
  - Default language is `en`, mirrored in the `language` cookie.

## Stack & Architecture

- **Framework**: Next.js 16 (App Router, `output: "standalone"`, `proxy.ts` instead of `middleware.ts`), React 19, TypeScript (`strict: true`, `@/*` alias), Tailwind CSS 4, `@ducanh2912/next-pwa`, Recharts, Lucide, `html5-qrcode`, `next-themes`.
- **Backend**: Supabase (Postgres + Auth + Storage + RLS).
  - `lib/supabase/server.ts` — server anon client with session cookies (RLS enforced).
  - `utils/supabase/client.ts` — browser client (RLS enforced).
  - `lib/supabase/admin.ts` — `service_role`, `server-only` (bypasses RLS). Use **only** for: account/data deletion (`app/settings/actions.ts`), shared barcode food catalog (`lib/foods.ts`), and `google_drive_backups` (strictly via `lib/drive-service.ts`).
- **Route Guard (`proxy.ts`)**: Protects authenticated routes and redirects unauthenticated requests to `/login`. Public/bypassed paths: `/offline`, `/privacy`, `/api/drive/cron` (auth via `CRON_SECRET`), `/sw.js`, `/manifest.json`, workbox scripts; `/login`, `/register`, `/api/offline` are allowed unauthenticated.
- **Deployment Target**: Self-hosted VPS via a single `docker-compose.yml` running minimal Supabase (`db`, `auth`, `rest`, `storage` — intentionally no Realtime, Studio, edge functions, or imgproxy), one-shot `migrate`, `app`, hourly `cron`, and `caddy` as a single-domain gateway (`/auth/v1`, `/rest/v1`, `/storage/v1`). See `docs/self-hosting.md`.
- **Paused Scope**: The Python/FastAPI ML module is paused.

### Key Directories

- `app/` — App Router pages (`/`, `/insert`, `/edit/[id]`, `/history`, `/records`, `/stats`, `/meals/**`, `/photos`, `/settings`, `/offline`, `/privacy`, `/login`, `/register`), server actions, and route handlers (`app/api/account/*`, `app/api/drive/*`, `app/api/food/*`, `app/api/offline`).
- `app/components/ui/` — Design-system primitives (`Screen`, `Columns`, `Stack`, `Card`, `Inner`, `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Segmented`, `Badge`, `Message`, `ProgressBar`, `CtaCard`, `LinkList`, `BigNumber`, `Empty`, `TextLink`, `pageWidth`).
- `app/components/workout-parts.tsx` — Shared workout set badges and session list used identically across `/insert`, `/offline`, and `/edit`.
- `lib/` — Pure domain logic and co-located `*.test.mjs` tests (`account-export`, `checkin`, `daily-metrics`, `drive-backup`, `drive-service`, `energy`, `exercise-catalog`, `foods`, `personal-record`, `photos`, `photos-restore`, `plateau`, `rest-timer`, `strength-progression`, `units`, `workout-*`).
- `lib/offline/` — IndexedDB store, offline provider, mutation model/validation, and sync helpers.
- `supabase/migrations/` — Ordered SQL migrations (`YYYYMMDDNNNN_*.sql`).
- `scripts/` — `gen-secrets.mjs`, `migrate.sh`, `verify-migrations.sh`.

## Commands & Verification

- **Dev / Build**:
  - `npm run dev` (service worker / PWA is disabled in dev).
  - `npm run build` (uses `next build --webpack`, required by `@ducanh2912/next-pwa`).
- **Unit tests** (Node 22.18+ / Node 24 imports `.ts` directly):
  - `node --test lib/*.test.mjs` (on Node 22.6–22.17 pass `--experimental-strip-types`).
- **Type check**: `npx tsc --noEmit -p .`
- **Lint**: `npx eslint <touched-files>`
  - The repo has pre-existing lint errors (`any`, `set-state-in-effect`). Do **not** introduce new errors; compare counts against `HEAD` on every file you modify.
- **Migration check** (Docker required): `bash scripts/verify-migrations.sh` — applies all `supabase/migrations/*.sql` to a throwaway Postgres and verifies all expected tables, RLS, profile trigger, and user-delete cascade.
- **SQL unit tests** (optional, requires PGlite): `PGLITE=/path/to/pglite/dist/index.js node --test supabase/tests/*.test.mjs`.

## Database & Migrations

- **Execution workflow**: On hosted Supabase, the user runs new migrations **manually in the Supabase SQL Editor** (do not assume `supabase db push` works — remote migration history diverges from local files).
- **Base schema**: `supabase/migrations/202610010000_base_schema.sql` is **only** for fresh self-hosted databases, never for the existing hosted Supabase project.
- **Migration rules**:
  - Wrap every migration in `begin; ... commit;`.
  - Every `security definer` function must set `set search_path = ''`, qualify all schema/table references (`public.*`, `auth.*`), and `revoke ... from public, anon`.
  - Never write RLS policies that `select` from the same table (causes infinite recursion); enforce row-count caps with triggers (as done for the 200-photo limit on `progress_photos`).
- **Pagination**: PostgREST returns at most 1000 rows per query (`PGRST_DB_MAX_ROWS: 1000`). Always paginate unbounded user queries with `.range()`.
- **Environment variables**:
  - Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (needed for barcode lookup and account deletion).
  - Optional: `USDA_API_KEY` (food search fallback).
  - Google Drive backup: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `DRIVE_TOKEN_KEY` (32 bytes base64 for AES-GCM refresh-token encryption), `CRON_SECRET` (for hourly `/api/drive/cron`). If any is missing, the Settings Drive card stays hidden.

## Design System (Tailwind CSS 4)

- **Tokens**: Defined in `app/globals.css`. Default Tailwind colors are **disabled** (`--color-*: initial`) — standard classes like `zinc-*`, `slate-*`, `emerald-*` do not exist.
- **Color discipline**:
  - `lime` is the **only** accent for primary actions.
  - `coral`, `ice`, `lilac`, `gold`, `red` are strictly for data semantics (set types, macros, chart series, warnings/errors).
  - Separate surfaces by fill (`bg-background`, `bg-card`, `bg-inner`, `bg-control`), not borders.
- **Tailwind 4 override rule**: Do **not** override via `className` a utility already applied inside a UI primitive (padding, background, min-height) — in Tailwind 4, CSS order wins over attribute order. Add an explicit prop/variant on the component instead (e.g., `compact`, `small`, `large`, `inCard`).

## Domain Rules & Invariants

- **GDPR checklist for any new user-data table**:
  1. Foreign key to `auth.users` with `on delete cascade` + RLS enabled with owner-only policies.
  2. Included in JSON export (`lib/account-export.ts`, `replog-export` v1 format — never export secrets/tokens).
  3. Included in SQL `import_my_data` and `delete_my_data` functions.
  4. Added to `expected` table list in `scripts/verify-migrations.sh`.
- **Progress photos (`/photos`, `lib/photos.ts`)**:
  - Images live in private Supabase Storage bucket `progress-photos` (`<user_id>/<id>.jpg`, browser-resized to 1600px JPEG, max 200 per user via trigger); Postgres stores metadata only.
  - Storage files do **not** cascade on user deletion and cannot be deleted via SQL: `deleteAllData` and `deleteAccount` (`app/settings/actions.ts`) must call `removeAllPhotoFiles` first and abort if it fails.
  - JSON export includes metadata only; `import_my_data` intentionally skips photo rows. Google Drive backup uploads images separately as `replog-photo-<id>.jpg` and restores them via `lib/photos-restore.ts`. Online-only.
- **Shared barcode food catalog (`lib/foods.ts`)**:
  - Barcode entries have `user_id = null` and are written server-side only from Open Food Facts — never trust client-submitted nutrition values for shared rows. User-created manual foods remain private.
- **Offline logging (`lib/offline/*`, `/offline`)**:
  - When `useOffline().ownerId` exists, workout, steps, weight, and check-in saves queue into IndexedDB (`saveOfflineMutation`) and replay atomically via SQL `sync_offline_entry` (idempotent via `offline_sync_receipts`).
  - Keep validation limits identical in all three places: Postgres table constraints, `sync_offline_entry`, and `lib/offline/model.ts` (plus `/insert` and `/offline` forms).
  - Unreachable navigation falls back to `/offline`, so every offline-capable feature must also work on `/offline`. Local queues must stay isolated per account on sign-out or account switch.
- **Weight units**:
  - Always store weights in **kg** in Postgres. Format/parse through `lib/units.ts`, `useUnits()` (client), and `getWeightUnit` / `getWeightFormatter` (`app/units.ts`, server).
  - User choice is stored in `profiles.weight_unit` and mirrored to the `weight_unit` cookie (updated on profile save, login, and registration).
- **Energy recommendation & plateau detection**:
  - `lib/energy.ts` (used in `/meals/progress/targets`): Mifflin-St Jeor × activity, or adaptive TDEE from mean calories (≥10 meal days) and weight regression (≥3 weigh-ins across ≥10 days — keep this threshold as decided by the user).
  - `lib/plateau.ts`: flags a plateau after `PLATEAU_SESSIONS = 4` sessions without a new estimated 1RM; shown alongside all-time PRs in `/insert` (not in `/offline`).
