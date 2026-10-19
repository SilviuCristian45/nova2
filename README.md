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
