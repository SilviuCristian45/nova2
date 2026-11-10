begin;

-- Daily check-in: how the person felt that day (energy, satiety, sleep quality, 1-10) plus a short note.
-- One row per user and date, like daily_weight. Every field is optional, but not all of them at once.
create table if not exists public.daily_checkin (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  energy smallint check (energy between 1 and 10),
  satiety smallint check (satiety between 1 and 10),
  sleep smallint check (sleep between 1 and 10),
  note text check (char_length(note) <= 280),
  primary key (user_id, date),
  check (energy is not null or satiety is not null or sleep is not null or note is not null)
);

alter table public.daily_checkin enable row level security;
revoke all on public.daily_checkin from anon;
grant select, insert, update, delete on public.daily_checkin to authenticated;

create policy "Users can read their own check-ins"
  on public.daily_checkin for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own check-ins"
  on public.daily_checkin for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own check-ins"
  on public.daily_checkin for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own check-ins"
  on public.daily_checkin for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Offline sync accepts the new entry kind 'checkin'. Limits match the table constraints above and lib/offline/model.ts.
create or replace function public.sync_offline_entry(mutation_id uuid, entry jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := auth.uid();
  saved jsonb;
  kind text := entry->>'kind';
  entry_date date;
  row_entry jsonb;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  if mutation_id is null or jsonb_typeof(entry) <> 'object' then raise exception 'Invalid entry'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));
  select r.payload into saved from public.offline_sync_receipts r
    where r.user_id = owner and r.mutation_id = sync_offline_entry.mutation_id;
  if found then
    if saved <> entry then raise exception 'Mutation ID already used for another entry'; end if;
    return;
  end if;
  if coalesce(entry->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  entry_date := (entry->>'date')::date;
  if entry_date < date '0001-01-01' or entry_date > current_date + 1 then raise exception 'Invalid date'; end if;

  if kind = 'steps' then
    if jsonb_typeof(entry->'steps') is distinct from 'number'
      or (entry->>'steps')::numeric not between 0 and 2147483647
      or trunc((entry->>'steps')::numeric) <> (entry->>'steps')::numeric
    then raise exception 'Invalid steps'; end if;
    insert into public.daily_steps (user_id, date, steps)
      values (owner, entry_date, (entry->>'steps')::integer)
      on conflict (user_id, date) do update set steps = excluded.steps;
  elsif kind = 'weight' then
    if jsonb_typeof(entry->'weightKg') is distinct from 'number'
      or (entry->>'weightKg')::numeric not between 0.01 and 9999.99
      or round((entry->>'weightKg')::numeric, 2) <> (entry->>'weightKg')::numeric
    then raise exception 'Invalid weight'; end if;
    insert into public.daily_weight (user_id, date, weight_kg)
      values (owner, entry_date, (entry->>'weightKg')::numeric)
      on conflict (user_id, date) do update set weight_kg = excluded.weight_kg;
  elsif kind = 'checkin' then
    if coalesce(jsonb_typeof(entry->'energy'), 'null') = 'null' and coalesce(jsonb_typeof(entry->'satiety'), 'null') = 'null'
      and coalesce(jsonb_typeof(entry->'sleep'), 'null') = 'null' and coalesce(entry->>'note', '') = ''
    then raise exception 'Invalid check-in'; end if;
    if coalesce(jsonb_typeof(entry->'energy'), 'null') not in ('number', 'null')
      or coalesce(jsonb_typeof(entry->'satiety'), 'null') not in ('number', 'null')
      or coalesce(jsonb_typeof(entry->'sleep'), 'null') not in ('number', 'null')
      or (jsonb_typeof(entry->'energy') = 'number' and ((entry->>'energy')::numeric not between 1 and 10 or trunc((entry->>'energy')::numeric) <> (entry->>'energy')::numeric))
      or (jsonb_typeof(entry->'satiety') = 'number' and ((entry->>'satiety')::numeric not between 1 and 10 or trunc((entry->>'satiety')::numeric) <> (entry->>'satiety')::numeric))
      or (jsonb_typeof(entry->'sleep') = 'number' and ((entry->>'sleep')::numeric not between 1 and 10 or trunc((entry->>'sleep')::numeric) <> (entry->>'sleep')::numeric))
      or coalesce(jsonb_typeof(entry->'note'), 'null') not in ('string', 'null')
      or length(coalesce(entry->>'note', '')) > 280
    then raise exception 'Invalid check-in'; end if;
    insert into public.daily_checkin (user_id, date, energy, satiety, sleep, note)
      values (owner, entry_date, (entry->>'energy')::smallint, (entry->>'satiety')::smallint,
        (entry->>'sleep')::smallint, nullif(entry->>'note', ''))
      on conflict (user_id, date) do update set energy = excluded.energy, satiety = excluded.satiety,
        sleep = excluded.sleep, note = excluded.note;
  elsif kind = 'workout' then
    if coalesce(entry->>'mode', '') not in ('strength', 'cardio')
      or length(coalesce(entry->>'split', '')) not between 1 and 100
      or jsonb_typeof(entry->'sets') is distinct from 'array'
      or jsonb_typeof(entry->'cardio') is distinct from 'array'
    then raise exception 'Invalid workout'; end if;
    if jsonb_array_length(entry->'sets') > 1000 or jsonb_array_length(entry->'cardio') > 1000 then
      raise exception 'Workout is too large';
    end if;
    if (entry->>'mode' = 'strength' and (jsonb_array_length(entry->'sets') = 0 or jsonb_array_length(entry->'cardio') > 0))
      or (entry->>'mode' = 'cardio' and (jsonb_array_length(entry->'cardio') = 0 or jsonb_array_length(entry->'sets') > 0))
    then raise exception 'Workout entries do not match mode'; end if;
    insert into public.workouts (id, user_id, workout_mode, split, performed_on)
      values (mutation_id, owner, entry->>'mode',
        case when entry->>'mode' = 'strength' then entry->>'split' else 'CARDIO' end, entry_date);
    for row_entry in select value from jsonb_array_elements(entry->'sets') loop
      if length(coalesce(row_entry->>'exercise', '')) not between 1 and 300
        or length(coalesce(row_entry->>'split', '')) not between 1 and 100
        or length(coalesce(row_entry->>'setType', '')) not between 1 and 100
        or length(coalesce(row_entry->>'notes', '')) >= 100
        or jsonb_typeof(row_entry->'reps') is distinct from 'number'
        or (row_entry->>'reps')::numeric not between 1 and 100000
        or trunc((row_entry->>'reps')::numeric) <> (row_entry->>'reps')::numeric
        or jsonb_typeof(row_entry->'setNumber') is distinct from 'number'
        or (row_entry->>'setNumber')::numeric not between 1 and 10000
        or trunc((row_entry->>'setNumber')::numeric) <> (row_entry->>'setNumber')::numeric
        or jsonb_typeof(row_entry->'weight') is distinct from 'number'
        or (row_entry->>'weight')::numeric not between 0 and 10000
        or jsonb_typeof(row_entry->'rir') is distinct from 'number'
        or (row_entry->>'rir')::numeric not between 0 and 5
        or trunc((row_entry->>'rir')::numeric) <> (row_entry->>'rir')::numeric
      then raise exception 'Invalid workout set'; end if;
      insert into public.workout_sets (workout_id, user_id, split, exercise, set_number, reps, weight, rir, set_type, notes)
        values (mutation_id, owner, row_entry->>'split', row_entry->>'exercise',
          (row_entry->>'setNumber')::integer, (row_entry->>'reps')::integer,
          (row_entry->>'weight')::numeric, (row_entry->>'rir')::integer,
          row_entry->>'setType', nullif(row_entry->>'notes', ''));
    end loop;
    for row_entry in select value from jsonb_array_elements(entry->'cardio') loop
      if length(coalesce(row_entry->>'activity', '')) not between 1 and 120
        or jsonb_typeof(row_entry->'durationMin') is distinct from 'number'
        or (row_entry->>'durationMin')::numeric not between 1 and 1440
        or trunc((row_entry->>'durationMin')::numeric) <> (row_entry->>'durationMin')::numeric
      then raise exception 'Invalid cardio entry'; end if;
      insert into public.cardio_sessions (workout_id, user_id, activity, duration_min)
        values (mutation_id, owner, row_entry->>'activity', (row_entry->>'durationMin')::integer);
    end loop;
  else
    raise exception 'Unknown offline entry type';
  end if;
  insert into public.offline_sync_receipts (user_id, mutation_id, payload)
    values (owner, mutation_id, entry);
end;
$$;
revoke all on function public.sync_offline_entry(uuid, jsonb) from public, anon;
grant execute on function public.sync_offline_entry(uuid, jsonb) to authenticated;

-- The export/import file gains a daily_checkin section; existing days are kept, as for steps and weight.
create or replace function public.import_my_data(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := auth.uid();
  counts jsonb := '{}';
  n integer;
  section text;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or p_data->>'format' is distinct from 'replog-export'
    or p_data->>'version' is distinct from '1'
  then raise exception 'Unsupported export file'; end if;
  foreach section in array array['foods', 'workouts', 'workout_sets', 'cardio_sessions', 'meals',
    'meal_items', 'meal_templates', 'daily_steps', 'daily_weight', 'daily_checkin'] loop
    if jsonb_typeof(coalesce(p_data->section, '[]')) <> 'array' then raise exception 'Invalid section: %', section; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));

  if jsonb_typeof(p_data->'profile') = 'object' then
    update public.profiles p set
      display_name = coalesce(p.display_name, i.display_name),
      height_cm = coalesce(p.height_cm, i.height_cm),
      birth_date = coalesce(p.birth_date, i.birth_date),
      sex = coalesce(p.sex, i.sex),
      -- Activity and goal are saved together, so an account without an activity level has never set either.
      activity_level = coalesce(p.activity_level, i.activity_level),
      goal_kg_per_week = case when p.activity_level is null then coalesce(i.goal_kg_per_week, p.goal_kg_per_week)
        else p.goal_kg_per_week end
    from jsonb_populate_record(null::public.profiles, p_data->'profile') i
    where p.id = owner;
  end if;

  if jsonb_typeof(p_data->'user_targets') = 'object' then
    insert into public.user_targets (user_id, kcal, protein, carbs, fat, fiber)
      select owner, coalesce(i.kcal, 2200), coalesce(i.protein, 160), coalesce(i.carbs, 250),
        coalesce(i.fat, 70), coalesce(i.fiber, 30)
      from jsonb_populate_record(null::public.user_targets, p_data->'user_targets') i
      on conflict (user_id) do nothing;
  end if;

  -- Imported foods stay private and drop the barcode: user-supplied values never enter the shared catalog.
  insert into public.foods (id, user_id, name, brand, barcode, kcal_per_100g, protein_per_100g, carbs_per_100g,
      fat_per_100g, saturated_fat_per_100g, polyunsaturated_fat_per_100g, fiber_per_100g, sodium_mg_per_100g, created_at)
    select public.import_food_id(owner, i.id, i.barcode), owner, i.name, i.brand, null,
      coalesce(i.kcal_per_100g, 0), coalesce(i.protein_per_100g, 0), coalesce(i.carbs_per_100g, 0),
      coalesce(i.fat_per_100g, 0), i.saturated_fat_per_100g, i.polyunsaturated_fat_per_100g,
      i.fiber_per_100g, i.sodium_mg_per_100g, coalesce(i.created_at, now())
    from jsonb_populate_recordset(null::public.foods, coalesce(p_data->'foods', '[]')) i
    on conflict (id) do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('foods', n);

  insert into public.workouts (id, user_id, performed_on, split, created_at, workout_mode)
    select public.import_row_id(exists (select 1 from public.workouts w where w.id = i.id and w.user_id = owner), owner, i.id),
      owner, i.performed_on, i.split, coalesce(i.created_at, now()), coalesce(i.workout_mode, 'strength')
    from jsonb_populate_recordset(null::public.workouts, coalesce(p_data->'workouts', '[]')) i
    on conflict (id) do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('workouts', n);

  insert into public.workout_sets (id, workout_id, user_id, split, exercise, set_number, reps, rir, set_type, created_at, weight, notes)
    select public.import_row_id(exists (select 1 from public.workout_sets s where s.id = i.id and s.user_id = owner), owner, i.id),
      public.import_row_id(exists (select 1 from public.workouts w where w.id = i.workout_id and w.user_id = owner), owner, i.workout_id),
      owner, i.split, i.exercise, i.set_number, i.reps, i.rir, i.set_type, coalesce(i.created_at, now()), coalesce(i.weight, 0), i.notes
    from jsonb_populate_recordset(null::public.workout_sets, coalesce(p_data->'workout_sets', '[]')) i
    on conflict (id) do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('workout_sets', n);

  insert into public.cardio_sessions (id, workout_id, user_id, activity, duration_min, created_at)
    select public.import_row_id(exists (select 1 from public.cardio_sessions c where c.id = i.id and c.user_id = owner), owner, i.id),
      public.import_row_id(exists (select 1 from public.workouts w where w.id = i.workout_id and w.user_id = owner), owner, i.workout_id),
      owner, i.activity, i.duration_min, coalesce(i.created_at, now())
    from jsonb_populate_recordset(null::public.cardio_sessions, coalesce(p_data->'cardio_sessions', '[]')) i
    on conflict (id) do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('cardio_sessions', n);

  insert into public.meals (id, user_id, performed_on, meal_type, notes, created_at)
    select public.import_row_id(exists (select 1 from public.meals m where m.id = i.id and m.user_id = owner), owner, i.id),
      owner, i.performed_on, i.meal_type, i.notes, coalesce(i.created_at, now())
    from jsonb_populate_recordset(null::public.meals, coalesce(p_data->'meals', '[]')) i
    on conflict (id) do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('meals', n);

  insert into public.meal_items (id, meal_id, food_id, consumed_weight_g, total_kcal, total_protein_g, total_carbs_g, total_fat_g, created_at)
    select public.import_row_id(exists (select 1 from public.meal_items mi join public.meals m on m.id = mi.meal_id
        where mi.id = i.id and m.user_id = owner), owner, i.id),
      public.import_row_id(exists (select 1 from public.meals m where m.id = i.meal_id and m.user_id = owner), owner, i.meal_id),
      public.import_food_id(owner, i.food_id, f.barcode),
      i.consumed_weight_g, coalesce(i.total_kcal, 0), coalesce(i.total_protein_g, 0), coalesce(i.total_carbs_g, 0),
      coalesce(i.total_fat_g, 0), coalesce(i.created_at, now())
    from jsonb_populate_recordset(null::public.meal_items, coalesce(p_data->'meal_items', '[]')) i
    left join (
      select distinct on (e.id) e.id, e.barcode
      from jsonb_populate_recordset(null::public.foods, coalesce(p_data->'foods', '[]')) e
    ) f on f.id = i.food_id
    on conflict (id) do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('meal_items', n);

  insert into public.meal_templates (id, user_id, name, items, created_at)
    select public.import_row_id(exists (select 1 from public.meal_templates t where t.id = i.id and t.user_id = owner), owner, i.id),
      owner, i.name, coalesce(i.items, '[]'), coalesce(i.created_at, now())
    from jsonb_populate_recordset(null::public.meal_templates, coalesce(p_data->'meal_templates', '[]')) i
    on conflict (id) do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('meal_templates', n);

  insert into public.daily_steps (user_id, date, steps)
    select owner, i.date, i.steps
    from jsonb_populate_recordset(null::public.daily_steps, coalesce(p_data->'daily_steps', '[]')) i
    on conflict (user_id, date) do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('daily_steps', n);

  insert into public.daily_weight (user_id, date, weight_kg)
    select owner, i.date, i.weight_kg
    from jsonb_populate_recordset(null::public.daily_weight, coalesce(p_data->'daily_weight', '[]')) i
    on conflict (user_id, date) do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('daily_weight', n);

  insert into public.daily_checkin (user_id, date, energy, satiety, sleep, note)
    select owner, i.date, i.energy, i.satiety, i.sleep, i.note
    from jsonb_populate_recordset(null::public.daily_checkin, coalesce(p_data->'daily_checkin', '[]')) i
    on conflict (user_id, date) do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('daily_checkin', n);

  return counts;
end;
$$;
revoke all on function public.import_my_data(jsonb) from public, anon;
grant execute on function public.import_my_data(jsonb) to authenticated;

-- "Delete all my data" also drops the check-ins.
create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));
  delete from public.workouts where user_id = owner;
  delete from public.workout_sets where user_id = owner;
  delete from public.cardio_sessions where user_id = owner;
  delete from public.workout_drafts where user_id = owner;
  delete from public.meals where user_id = owner;
  delete from public.meal_templates where user_id = owner;
  delete from public.foods where user_id = owner;
  delete from public.user_targets where user_id = owner;
  delete from public.daily_steps where user_id = owner;
  delete from public.daily_weight where user_id = owner;
  delete from public.daily_checkin where user_id = owner;
  delete from public.offline_sync_receipts where user_id = owner;
  delete from public.google_drive_backups where user_id = owner;
end;
$$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

commit;
