begin;

-- update_workout used to delete every set and insert new ones, so each edit regenerated the set ids and
-- re-importing an older export duplicated the edited sets. Sets that arrive with an "id" are now updated in
-- place (they keep their id), sets without one are inserted with a new id, and sets of the workout that are
-- not in the payload are deleted. Everything runs in one transaction: any error rolls the whole edit back.
-- An "id" must belong to a set of this very workout and of the caller, otherwise the call fails.
create or replace function public.update_workout(
  p_workout_id uuid, p_mode text, p_split text, p_date date, p_sets jsonb, p_cardio jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := auth.uid();
  row_entry jsonb;
  bad_rir boolean;
  set_id uuid;
  kept uuid[] := '{}';
begin
  if owner is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));
  if p_mode not in ('strength', 'cardio')
    or length(coalesce(p_split, '')) not between 1 and 100
    or p_date is null or p_date < date '0001-01-01' or p_date > current_date + 1
    or jsonb_typeof(p_sets) is distinct from 'array'
    or jsonb_typeof(p_cardio) is distinct from 'array'
  then raise exception 'Invalid workout'; end if;
  if jsonb_array_length(p_sets) > 1000 or jsonb_array_length(p_cardio) > 1000 then
    raise exception 'Workout is too large';
  end if;
  if (p_mode = 'strength' and jsonb_array_length(p_cardio) > 0)
    or (p_mode = 'cardio' and jsonb_array_length(p_sets) > 0)
  then raise exception 'Workout entries do not match mode'; end if;

  update public.workouts set split = p_split, performed_on = p_date
    where id = p_workout_id and user_id = owner;
  if not found then raise exception 'Workout not found'; end if;

  for row_entry in select value from jsonb_array_elements(p_sets) loop
    -- RIR is optional (null or missing); when present it is a whole number 0-5.
    bad_rir := case when coalesce(jsonb_typeof(row_entry->'rir'), 'null') = 'null' then false
      when jsonb_typeof(row_entry->'rir') <> 'number' then true
      else (row_entry->>'rir')::numeric not between 0 and 5
        or trunc((row_entry->>'rir')::numeric) <> (row_entry->>'rir')::numeric end;
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
      or bad_rir
    then raise exception 'Invalid workout set'; end if;

    if coalesce(jsonb_typeof(row_entry->'id'), 'null') = 'null' then
      insert into public.workout_sets (workout_id, user_id, split, exercise, set_number, reps, weight, rir, set_type, notes)
        values (p_workout_id, owner, row_entry->>'split', row_entry->>'exercise',
          (row_entry->>'setNumber')::integer, (row_entry->>'reps')::integer,
          (row_entry->>'weight')::numeric, (row_entry->>'rir')::integer,
          row_entry->>'setType', nullif(row_entry->>'notes', ''))
        returning id into set_id;
    else
      if jsonb_typeof(row_entry->'id') <> 'string'
        or row_entry->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then raise exception 'Invalid set id'; end if;
      set_id := (row_entry->>'id')::uuid;
      if set_id = any(kept) then raise exception 'Duplicate set id'; end if;
      update public.workout_sets set split = row_entry->>'split', exercise = row_entry->>'exercise',
          set_number = (row_entry->>'setNumber')::integer, reps = (row_entry->>'reps')::integer,
          weight = (row_entry->>'weight')::numeric, rir = (row_entry->>'rir')::integer,
          set_type = row_entry->>'setType', notes = nullif(row_entry->>'notes', '')
        where id = set_id and workout_id = p_workout_id and user_id = owner;
      if not found then raise exception 'Set does not belong to this workout'; end if;
    end if;
    kept := kept || set_id;
  end loop;

  delete from public.workout_sets
    where workout_id = p_workout_id and user_id = owner and id <> all(kept);

  -- Cardio rows are replaced as before (the form never shows their ids).
  delete from public.cardio_sessions where workout_id = p_workout_id and user_id = owner;
  for row_entry in select value from jsonb_array_elements(p_cardio) loop
    if length(coalesce(row_entry->>'activity', '')) not between 1 and 120
      or jsonb_typeof(row_entry->'durationMin') is distinct from 'number'
      or (row_entry->>'durationMin')::numeric not between 1 and 1440
      or trunc((row_entry->>'durationMin')::numeric) <> (row_entry->>'durationMin')::numeric
    then raise exception 'Invalid cardio entry'; end if;
    insert into public.cardio_sessions (workout_id, user_id, activity, duration_min)
      values (p_workout_id, owner, row_entry->>'activity', (row_entry->>'durationMin')::integer);
  end loop;
end;
$$;
revoke all on function public.update_workout(uuid, text, text, date, jsonb, jsonb) from public, anon;
grant execute on function public.update_workout(uuid, text, text, date, jsonb, jsonb) to authenticated;
commit;
