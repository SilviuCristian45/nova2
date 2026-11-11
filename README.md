This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Appearance and progress export

- Use the sun/moon button at the top of any page to switch between light and dark mode. The initial theme follows your device; a manual choice is saved in this browser.
- Dashboard, workout, history, chart, and meal screens adapt to mobile, tablet, and desktop widths.
- In **Evoluție & Grafice → Forță**, select an exercise and period, then click **Export CSV** beside the graph. The UTF-8 CSV contains one row per plotted session with the full date, exercise, maximum working-set weight (kg), and maximum working-set repetitions. These maxima are independent, just like the graph; they need not come from the same set. Warm-up sets are excluded. The button is disabled while loading or when no data is available.
- **ALL** includes all recorded dates through today. Chart queries are paginated to include data beyond Supabase's per-response limit.

## Body weight, steps, and language

- Use the English/Romanian selector next to the theme switch to change interface text. English is the default; the saved browser cookie seeds server rendering so the initial page matches your preference. Workout exercise/activity names and saved notes remain unchanged.
- The dashboard has daily **Steps** and **Body weight** cards, each with a **View chart** link. Weight is recorded in **kg**, with up to two decimal places; either `75.5` or `75,5` is accepted. Select a date to enter or correct a past weigh-in. Saving again updates that day's entry rather than adding a duplicate.
- **Progress & Charts** has separate **Strength**, **Cardio**, **Steps**, and **Weight** views, with the same period filters. Steps shows recorded counts and the current daily goal. Weight shows recorded weigh-ins only; unrecorded days are not zero.
- **Strength** uses a cyan line with points for lifted weight and a dashed green line with points for repetitions. Weights use the left kg scale; reps have a separate green scale on the right. Red **Body weight (kg)** scatter points appear when a weigh-in exists on that exact workout date. Multiple sessions on the same date share that day's weigh-in; missing dates have no red point and are not filled from other days or treated as zero. Cardio duration also uses a line with points instead of bars. CSV exports are unchanged and include a **Body weight (kg)** column when at least one plotted session has a weigh-in, with blank cells for missing entries. A weight-storage failure displays a warning without blocking the strength graph or steps view.
- Direct chart links: `/stats?mode=steps` and `/stats?mode=weight`.

### Database setup for weight tracking

Before using weight tracking, apply [`supabase/migrations/202610160001_daily_weight.sql`](./supabase/migrations/202610160001_daily_weight.sql) to the app's Supabase project using the **SQL Editor** (or your normal Supabase migration workflow).

The migration creates `public.daily_weight`, with one record per authenticated user/date, a positive decimal kg value, and row-level security policies restricting reads and writes to the owner. It does not change the existing steps or workouts tables. No additional environment variables are needed.

Until the migration is applied, the weight card and weight chart show an explicit setup error rather than claiming a weight was saved.

Run the progression/export checks with Node.js 22.18+:

```bash
node --test lib/strength-progression.test.mjs lib/daily-metrics.test.mjs lib/weight-actions.test.mjs lib/language.test.mjs
```

## Daily check-in, record and plateau hints

- The dashboard has a **How do you feel today?** card: energy, satiety and sleep quality from 1 to 10 (tap the chosen score again to clear it) plus a short note. Every field is optional, but not all of them at once; saving a date again replaces that day. **Progress & Charts → Mood** plots the three scores (days without an answer stay empty). It also works offline.
- Before using it, run `supabase/migrations/202611100001_daily_checkin.sql` in the Supabase SQL Editor. It creates `daily_checkin` and updates `sync_offline_entry`, `import_my_data` and `delete_my_data`. Until then the export, import and offline download keep working without check-ins.
- In **New workout**, selecting an exercise also shows its all-time record (best non-warmup set, estimated 1RM and date). If the exercise has gone 4 sessions without a new best estimated 1RM (`PLATEAU_SESSIONS` in `lib/plateau.ts`), a plateau note suggests a deload or a different rep range.

## Progress photos

- `/photos` (linked from the dashboard): upload a photo with a date, a pose (front/side/back/other) and an optional note, browse them by day, filter by pose, open one full screen, delete it, or pick two to compare side by side. Photos are shrunk in the browser (long edge 1600 px, JPEG) before upload; at most 200 per account.
- Before using it, run `supabase/migrations/202611110001_progress_photos.sql` in the Supabase SQL Editor. It creates the `progress_photos` table (RLS; the 200-photo cap is a trigger), the **private** Storage bucket `progress-photos` (JPEG only, 5 MB per file, owner-only policies on `<user_id>/…`) and updates `delete_my_data`.
- **Where they live:** the images are in Supabase Storage (so on a self-hosted Supabase they move with it); only the metadata is in Postgres. The page reads them through signed links that expire after an hour.
- **Account / data deletion:** Storage files do not cascade from `auth.users` and cannot be deleted with SQL, so `deleteAllData` and `deleteAccount` (`app/settings/actions.ts`) first remove the user's folder through the Storage API (`removeAllPhotoFiles`). If that fails, nothing else is deleted and the user can retry. The user's Drive photo copies are deleted too (best effort).
- **Export:** the JSON export (`progress_photos`) carries the metadata only, not the images; each photo can be opened/saved from the viewer. The JSON import (`import_my_data`) does not create photo rows, because it could not bring the files back.
- **Google Drive backup:** each backup also uploads the photos that are not in Drive yet, as separate `replog-photo-<id>.jpg` files in the app folder (at most 40 new ones per run; the rest follow on the next backup). The JSON backup lists them, and pruning of old backups ignores images. **Restoring** a Drive backup re-creates the rows and downloads the images from Drive for photos the account does not have.

## Offline logging

### Setup

1. Apply the [weight migration](./supabase/migrations/202610160001_daily_weight.sql), then the [offline sync migration](./supabase/migrations/202610190001_offline_sync.sql) in your Supabase SQL Editor or normal migration workflow. The latter adds an authenticated, transactional sync function and private replay receipts; it does not replace existing workout data.
2. Deploy with `npm run build` and `npm start` on HTTPS (or localhost). Production uses webpack because the PWA plugin needs its webpack integration. Service workers are deliberately disabled in `npm run dev`.
3. Sign in while online and use **Offline log > Sync / download**. Wait for the download to finish and open the offline log once before disconnecting. When updating an existing installation, close all app tabs and reopen so the new service worker can activate.

### What works offline

- **Offline log** saves strength/cardio workouts, daily steps, and body weight in this browser's IndexedDB. Saved entries survive reloads and appear immediately in local history. A failed local save displays an error and retains the form; it is not reported as saved.
- The normal workout, steps, and weight screens also use the durable local queue once an account is downloaded. When a page cannot load without a network, the service worker opens the dedicated offline workspace instead.
- The workspace includes downloaded workouts, steps, and weights from the last 90 days, plus pending entries. Missing metrics stay blank rather than becoming zero.
- Reconnection automatically retries while the app is open; **Sync / download** also retries manually. Pending counts distinguish device-only entries from completed uploads. Closing the app does **not** guarantee background synchronization.
- Workouts and their details are written atomically. Retrying the same queued ID after a lost reply does not create another workout. Entries are replayed in order; for steps/weight on the same date, the last uploaded value wins. There is no automatic multi-device conflict resolution.
- English/Romanian selection and light/dark mode work in the offline workspace.

Nutrition/food search/barcodes, progress charts, workout editing/deletion, goals, registration, and sign-in still require internet access. Unsaved lists in the dedicated offline workout form are not drafts: click **Save full workout** before leaving. The regular workout screen keeps account-scoped local drafts.

### Storage and account safety

Only the active downloaded account is shown. Sign-out, expired authentication, and account changes lock local access without uploading another account's queue. Sign back into the original account and use **Sync / download** to recover and upload its pending entries. **Remove offline data** discards the active account's downloaded data and unsynced queue on this browser; automatic downloads remain paused until you explicitly download again. This does not delete cloud data or another account's retained queue.

Local data is **not encrypted** and is accessible to people with access to this browser profile. Use a private browser profile on shared devices. Browser storage can be cleared or evicted, private browsing may not retain it, and quota/storage errors can prevent saves. Sync before clearing site data or changing devices; offline storage is not a backup. Authenticated HTML and API responses are not cached by the service worker; only the public offline shell and static assets are cached.

If migrations are missing, uploads remain queued and an explicit setup error appears. Apply the migration, then retry; do not clear local data to resolve a sync error.

Run the focused offline validation with Node.js 22.18+:

```bash
node --test lib/offline.test.mjs
```

## Automatic Google Drive backup

**Settings → Automatic Google Drive backup** links a Google account and uploads the same `replog-export` v1 file as
**Your data → Download** to the hidden app folder of that Drive (scope `drive.appdata`: the app sees only its own
files). Frequency: off / daily / weekly / monthly; the latest 5 backups are kept. Backups run on the server: an hourly
cron, plus a catch-up call when the app is opened. Restoring merges a Drive backup into the account (preview and
confirmation first); backups made by the RepLog phone app appear in the same list, since both use the same folder.

### Setup

1. Run `supabase/migrations/202611090001_google_drive_backups.sql` in the Supabase SQL Editor.
2. In the **same Google Cloud project as the phone app**, use (or create) an OAuth client of type **Web application**
   and add the authorized redirect URIs `https://<your-domain>/api/drive/callback` and
   `http://localhost:3000/api/drive/callback`. On the consent screen add the scopes `openid`, `email` and
   `.../auth/drive.appdata`, then **publish the app ("In production")**: in "Testing" Google expires refresh tokens
   after 7 days and automatic backups would stop. These scopes are non-sensitive and need no verification.
3. Set the server environment variables:

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the Web OAuth client (the secret stays on the server) |
   | `GOOGLE_REDIRECT_URI` | `https://<your-domain>/api/drive/callback` |
   | `DRIVE_TOKEN_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`); encrypts the stored refresh tokens |
   | `CRON_SECRET` | a long random string |
   | `SUPABASE_SERVICE_ROLE_KEY` | already required for barcode scanning and account deletion |

   Without these the Drive card stays hidden.
4. Call the cron every hour: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/drive/cron`
   (a cron job or a small container on the VPS). On Vercel, a `crons` entry in `vercel.json` for `/api/drive/cron`
   works too (Vercel sends `Authorization: Bearer $CRON_SECRET` itself), but hourly schedules need a paid plan.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
