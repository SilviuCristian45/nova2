-- Base schema: the tables that existed before the first incremental migration (202610160001).
--
-- ONLY for a brand-new database (self-hosted Supabase / VPS), run before every other migration.
-- The hosted project already has these tables: do NOT run this file there. To make `supabase db push`
-- work against it, mark it as applied instead:  supabase migration repair --status applied 202610010000
--
-- It reproduces the ORIGINAL state on purpose (no ON DELETE CASCADE to auth.users on a few tables, no
-- display_name/height/... on profiles, original meal_items policy): later migrations alter those objects
-- by name (202610240001, 202610270001) and would fail if they were already in their final shape.
-- Tables created by later migrations (daily_weight, offline_sync_receipts, workout_drafts, ...) are not here.
begin;

create table public.workouts (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null constraint workouts_user_id_fkey references auth.users(id) on delete cascade,
  performed_on date not null default current_date,
  split text not null,
  created_at timestamptz not null default now(),
  client_id text,
  workout_mode text not null default 'strength' constraint workouts_workout_mode_check check (workout_mode in ('strength', 'cardio'))
);
create index workouts_user_id_idx on public.workouts (user_id, performed_on desc, created_at desc);
create unique index workouts_user_client_id_uidx on public.workouts (user_id, client_id) where client_id is not null;

create table public.workout_sets (
  id uuid not null default gen_random_uuid() primary key,
  workout_id uuid not null constraint workout_sets_workout_id_fkey references public.workouts(id) on delete cascade,
  user_id uuid not null constraint workout_sets_user_id_fkey references auth.users(id) on delete cascade,
  split text not null,
  exercise text not null,
  set_number integer not null constraint workout_sets_set_number_check check (set_number >= 1),
  reps integer not null constraint workout_sets_reps_check check (reps >= 0),
  rir integer not null constraint workout_sets_rir_check check (rir between 0 and 5),
  set_type text not null,
  created_at timestamptz not null default now(),
  weight numeric(7, 2) not null default 0 constraint workout_sets_weight_check check (weight between 0 and 10000),
  notes varchar constraint workout_sets_notes_check check (length(notes::text) < 100)
);
create index workout_sets_workout_id_idx on public.workout_sets (workout_id);

create table public.cardio_sessions (
  id uuid not null default gen_random_uuid() primary key,
  workout_id uuid not null constraint cardio_sessions_workout_id_fkey references public.workouts(id) on delete cascade,
  user_id uuid not null constraint cardio_sessions_user_id_fkey references auth.users(id) on delete cascade,
  activity text not null constraint cardio_sessions_activity_check check (char_length(activity) between 1 and 120),
  duration_min integer not null constraint cardio_sessions_duration_min_check check (duration_min > 0 and duration_min <= 1440),
  created_at timestamptz not null default now()
);
create index cardio_sessions_user_id_idx on public.cardio_sessions (user_id);
create index cardio_sessions_workout_id_idx on public.cardio_sessions (workout_id);

-- Original profile: only the steps goal. Personal details and energy goals come with 202610240001 / 202610270001.
create table public.profiles (
  id uuid not null primary key constraint profiles_id_fkey references auth.users(id),
  daily_steps_goal integer not null default 10000 constraint goal_positive check (daily_steps_goal > 0)
);

create table public.daily_steps (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null constraint daily_steps_user_id_fkey references auth.users(id),
  date date not null default current_date,
  steps integer not null default 0,
  constraint daily_steps_user_id_date_key unique (user_id, date)
);

create table public.user_targets (
  user_id uuid not null primary key constraint user_targets_user_id_fkey references auth.users(id),
  kcal integer not null default 2200,
  protein integer not null default 160,
  carbs integer not null default 250,
  fat integer not null default 70,
  fiber integer not null default 30,
  updated_at timestamptz default timezone('utc', now())
);

create table public.foods (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid constraint foods_user_id_fkey references auth.users(id),
  name text not null,
  brand text,
  barcode text constraint foods_barcode_key unique,
  kcal_per_100g numeric not null default 0,
  protein_per_100g numeric not null default 0,
  carbs_per_100g numeric not null default 0,
  fat_per_100g numeric not null default 0,
  saturated_fat_per_100g numeric default 0,
  polyunsaturated_fat_per_100g numeric default 0,
  fiber_per_100g numeric default 0,
  sodium_mg_per_100g numeric default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.meals (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null constraint meals_user_id_fkey references auth.users(id),
  performed_on date not null default current_date,
  meal_type text not null constraint meals_meal_type_check check (meal_type in ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.meal_items (
  id uuid not null default gen_random_uuid() primary key,
  meal_id uuid not null constraint meal_items_meal_id_fkey references public.meals(id) on delete cascade,
  food_id uuid not null constraint meal_items_food_id_fkey references public.foods(id),
  consumed_weight_g numeric not null,
  total_kcal numeric not null default 0,
  total_protein_g numeric not null default 0,
  total_carbs_g numeric not null default 0,
  total_fat_g numeric not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.meal_templates (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null constraint meal_templates_user_id_fkey references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- Row level security. Policy names are kept as they were created (some are Romanian).
alter table public.workouts enable row level security;
create policy "workouts_select_own" on public.workouts for select using (auth.uid() = user_id);
create policy "workouts_insert_own" on public.workouts for insert with check (auth.uid() = user_id);
create policy "workouts_update_own" on public.workouts for update using (auth.uid() = user_id);
create policy "workouts_delete_own" on public.workouts for delete using (auth.uid() = user_id);
create policy "Permite stergerea antrenamentelor" on public.workouts for delete using (auth.uid() = user_id);

alter table public.workout_sets enable row level security;
create policy "workout_sets_select_own" on public.workout_sets for select using (auth.uid() = user_id);
create policy "workout_sets_insert_own" on public.workout_sets for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.workouts w where w.id = workout_sets.workout_id and w.user_id = auth.uid())
);
create policy "workout_sets_update_own" on public.workout_sets for update using (auth.uid() = user_id);
create policy "workout_sets_delete_own" on public.workout_sets for delete using (auth.uid() = user_id);
create policy "Permite stergerea seturilor" on public.workout_sets for delete using (auth.uid() = user_id);

alter table public.cardio_sessions enable row level security;
create policy "Users manage own cardio sessions" on public.cardio_sessions
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Permite stergerea cardio" on public.cardio_sessions for delete using (auth.uid() = user_id);

alter table public.profiles enable row level security;
create policy "Utilizatorii își pot vedea propriul profil." on public.profiles for select using (auth.uid() = id);
create policy "Utilizatorii își pot actualiza propriul profil." on public.profiles for update using (auth.uid() = id);

alter table public.daily_steps enable row level security;
create policy "Utilizatorii își pot vedea proprii pași." on public.daily_steps for select using (auth.uid() = user_id);
create policy "Utilizatorii își pot insera proprii pași." on public.daily_steps for insert with check (auth.uid() = user_id);
create policy "Utilizatorii își pot actualiza proprii pași." on public.daily_steps for update using (auth.uid() = user_id);

alter table public.user_targets enable row level security;
create policy "Users pot edita doar propriile targeturi" on public.user_targets
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.foods enable row level security;
create policy "Produsele sunt vizibile pentru toată lumea sau propriile custo" on public.foods
  for select using (user_id is null or auth.uid() = user_id);
create policy "Utilizatorii își pot adăuga propriile produse custom." on public.foods
  for insert with check (auth.uid() = user_id);

alter table public.meals enable row level security;
create policy "Utilizatorii își pot gestiona propriile mese." on public.meals using (auth.uid() = user_id);

alter table public.meal_items enable row level security;
create policy "Utilizatorii își pot gestiona elementele meselor." on public.meal_items
  using ((select auth.uid()) in (select m.user_id from public.meals m where m.id = meal_items.meal_id));

alter table public.meal_templates enable row level security;
create policy "Utilizatorii isi vad propriile sabloane" on public.meal_templates for select using (auth.uid() = user_id);
create policy "Utilizatorii pot crea sabloane" on public.meal_templates for insert with check (auth.uid() = user_id);
create policy "Utilizatorii pot sterge sabloane" on public.meal_templates for delete using (auth.uid() = user_id);

-- A profile row is created for every new auth user (replaced with the final body in 202610240001).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, daily_steps_goal) values (new.id, 10000);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
