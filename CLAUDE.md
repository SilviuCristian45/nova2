@AGENTS.md

# RepLog (nova2) — context proiect

PWA de fitness: antrenamente (seturi, cardio, progresie), mese și macronutrienți, pași, greutate corporală.
Utilizatorul comunică în română; codul și comentariile sunt în engleză, textele din UI sunt bilingve.

## Stack și direcție
- Next.js 16 (App Router, `proxy.ts` în loc de middleware), React 19, Tailwind 4, TypeScript, `@ducanh2912/next-pwa`.
- Supabase: Postgres + Auth + RLS. Clienți: `lib/supabase/server.ts` (anon, cu sesiune), `utils/supabase/client.ts` (browser),
  `lib/supabase/admin.ts` (service_role, `server-only`: doar ștergerea contului și catalogul de coduri de bare).
- Țintă: self-hosted pe VPS prin docker-compose (încă nefăcut: lipsesc `output: "standalone"`, Dockerfile, compose).
- Modulul ML (Python/FastAPI) e în pauză.

## Comenzi
- `npm run dev`; `npm run build` (folosește `--webpack`; PWA e dezactivat în dev).
- Teste: `node --experimental-strip-types --test lib/*.test.mjs` (Node 22; testele importă direct fișiere `.ts`).
- `npx tsc --noEmit -p .` și `npx eslint <fișiere>`. ESLint are erori vechi (`any`, `set-state-in-effect`);
  nu adăuga altele noi — compară numărul de erori cu `HEAD` pe fișierele atinse.

## Baza de date și migrații
- Migrațiile sunt în `supabase/migrations/`. **Utilizatorul le rulează manual din Supabase SQL Editor**, nu cu `db push`.
- Istoricul de migrații din Supabase nu se potrivește cu folderul local (remote are 4 versiuni din iulie 2026 fără fișiere
  locale; cele locale nu sunt înregistrate remote). `db push` eșuează până la `migration repair`. Nu există încă
  o migrație de bază pentru tabelele inițiale — necesară pentru VPS.
- `backup_complet.sql` (în .gitignore) = dump de schemă din 2026-10-24, de dinaintea migrațiilor din acea zi.
- Fiecare migrație: `begin; … commit;`. Funcțiile `security definer` au `set search_path = ''`, nume calificate
  complet și `revoke … from public, anon`.
- Variabile de mediu: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  (fără ea nu merg scanarea codurilor de bare și ștergerea contului).

## Reguli care nu se văd ușor din cod
- **GDPR:** toate tabelele cu date de utilizator au FK `on delete cascade` spre `auth.users`. Un tabel nou trebuie:
  cascade, RLS, inclus în `app/api/account/export/route.ts`, în funcția SQL `import_my_data` și în `delete_my_data`.
- **Catalog comun de alimente:** produsele cu cod de bare au `user_id = null` și se scriu doar pe server, prin
  `lib/foods.ts` (date de la Open Food Facts, niciodată valori trimise de client). Alimentele manuale sunt private.
- **Offline:** salvările trec prin coada din IndexedDB (`saveOfflineMutation`) când `useOffline().ownerId` există;
  serverul aplică prin funcția SQL `sync_offline_entry`. Limitele de validare trebuie să fie identice în trei locuri:
  constrângerile tabelelor, `sync_offline_entry` și `lib/offline/model.ts` (plus formularele din `/insert` și `/offline`).
  Fără rețea, navigarea ajunge pe `/offline`, deci funcțiile „offline” trebuie să existe și acolo.
- **Unități:** greutățile se stochează mereu în kg. Afișare/introducere prin `lib/units.ts`, `useUnits()` (client) și
  `getWeightUnit` / `getWeightFormatter` (server, `app/units.ts`). Unitatea vine din `profiles.weight_unit`, copiată
  în cookie-ul `weight_unit` (setat la salvarea profilului, la login și la înregistrare).
- **Limbă:** `t(ro, en)` / `<Text ro en />`; server `getLanguage()`, client `useLanguage()`.
- Supabase întoarce maxim 1000 de rânduri pe cerere: paginează cu `.range()`.

## Funcționalități principale
- `/settings`: profil, email/parolă, export/import JSON („Datele tale”), Danger Zone (șterge datele / contul).
- `/meals/progress/targets`: recomandare calorii (`lib/energy.ts`): Mifflin-St Jeor × activitate, sau TDEE adaptiv din
  media caloriilor (≥10 zile cu mese) și trendul greutății (regresie, ≥3 cântăriri pe ≥10 zile — pragul rămâne așa,
  decizia utilizatorului).
- Cronometru de pauză între seturi (`app/components/rest-timer.tsx`) în `/insert` și `/offline`.

## Idei amânate
- Migrație de bază + reparare istoric migrații; Docker/standalone pentru VPS.
- Măsurători corporale (talie, piept etc.), rutine de antrenament, link direct spre recomandarea de calorii.
- Aplicație mobilă separată, complet offline (Expo + SQLite) — amânată de utilizator.
