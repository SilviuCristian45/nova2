begin;

-- Target id for an imported row: rows already in this account keep their id, so importing the same
-- file twice is a no-op; anything else gets a stable per-account id, so a file exported from another
-- account never collides with that account's rows.
create or replace function public.import_row_id(p_owned boolean, p_owner uuid, p_old uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_owned then p_old else extensions.uuid_generate_v5(p_owner, p_old::text) end;
$$;
revoke all on function public.import_row_id(boolean, uuid, uuid) from public, anon, authenticated;

-- Foods resolve to the shared catalog (same barcode or same catalog row), then to the user's own copy.
create or replace function public.import_food_id(p_owner uuid, p_old uuid, p_barcode text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select f.id from public.foods f where p_barcode is not null and f.barcode = p_barcode and f.user_id is null),
    (select f.id from public.foods f where f.id = p_old and (f.user_id is null or f.user_id = p_owner)),
    extensions.uuid_generate_v5(p_owner, p_old::text)
  );
$$;
revoke all on function public.import_food_id(uuid, uuid, text) from public, anon, authenticated;

-- Imports a file produced by /api/account/export into the signed-in account. All or nothing.
-- Existing entries are never overwritten: same-day steps/weight and existing rows are kept.
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
    'meal_items', 'meal_templates', 'daily_steps', 'daily_weight'] loop
    if jsonb_typeof(coalesce(p_data->section, '[]')) <> 'array' then raise exception 'Invalid section: %', section; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));

  if jsonb_typeof(p_data->'profile') = 'object' then
    update public.profiles p set
      display_name = coalesce(p.display_name, i.display_name),
      height_cm = coalesce(p.height_cm, i.height_cm),
      birth_date = coalesce(p.birth_date, i.birth_date),
      sex = coalesce(p.sex, i.sex)
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

  return counts;
end;
$$;
revoke all on function public.import_my_data(jsonb) from public, anon;
grant execute on function public.import_my_data(jsonb) to authenticated;

commit;
