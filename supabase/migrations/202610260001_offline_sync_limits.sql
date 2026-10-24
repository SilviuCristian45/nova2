begin;

-- Offline sync accepted values the tables reject (long notes, RIR above 5, fractional cardio minutes,
-- weights above 10000), so such entries could never sync. Limits now match the table constraints.
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
commit;
