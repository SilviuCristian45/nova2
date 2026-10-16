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

Run the progression/export checks with Node.js 22.18+:

```bash
node --test lib/strength-progression.test.mjs
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
