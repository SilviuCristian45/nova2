


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."activate_coach_role"("p_display_name" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner uuid := auth.uid();
  resolved_name text;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  perform set_config('replog.allow_role_change', 'on', true);

  update public.profiles
  set role = 'coach',
      display_name = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), display_name)
  where id = owner
  returning coalesce(nullif(trim(display_name), ''), 'Coach') into resolved_name;

  if not found then
    raise exception 'Profile not found';
  end if;

  insert into public.coach_profiles (user_id, display_name)
  values (owner, left(resolved_name, 80))
  on conflict (user_id) do update
    set display_name = case
      when nullif(trim(coalesce(p_display_name, '')), '') is not null then left(trim(p_display_name), 80)
      else public.coach_profiles.display_name
    end,
    updated_at = now();

  return 'coach';
end;
$$;


ALTER FUNCTION "public"."activate_coach_role"("p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_program"("p_program_id" "uuid", "p_uid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.programs pr
    where pr.id = p_program_id
      and (
        pr.coach_id = p_uid
        or (pr.status = 'published' and pr.access_type = 'public' and pr.assigned_client_id is null)
        or exists (
          select 1 from public.enrollments e
          where e.program_id = pr.id
            and e.client_id = p_uid
            and e.status in ('pending', 'active', 'paused', 'completed')
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_read_program"("p_program_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_program_content"("p_program_id" "uuid", "p_uid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.programs pr
    where pr.id = p_program_id
      and (
        pr.coach_id = p_uid
        or (pr.status = 'published' and pr.access_type = 'public' and pr.assigned_client_id is null)
        or exists (
          select 1 from public.enrollments e
          where e.program_id = pr.id
            and e.client_id = p_uid
            and e.status in ('active', 'completed')
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_read_program_content"("p_program_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_program_for_client"("p_program_id" "uuid", "p_client_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  coach uuid := auth.uid();
  src public.programs%rowtype;
  new_program_id uuid;
  w_row public.program_workouts%rowtype;
  new_workout_id uuid;
begin
  if coach is null or not public.is_coach(coach) then
    raise exception 'Coach access required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_active_coach_of(p_client_id, coach) then
    raise exception 'Client is not active under this coach' using errcode = 'insufficient_privilege';
  end if;
  select * into src from public.programs where id = p_program_id and coach_id = coach;
  if not found then
    raise exception 'Program not found';
  end if;

  insert into public.programs (
    coach_id, assigned_client_id, title, description, difficulty, duration_weeks,
    goal, status, access_type, requires_approval, invite_code
  ) values (
    coach, p_client_id, src.title, src.description, src.difficulty, src.duration_weeks,
    src.goal, 'published', 'invite_only', false, null
  ) returning id into new_program_id;

  for w_row in
    select * from public.program_workouts where program_id = src.id order by week_number, day_number, position
  loop
    insert into public.program_workouts (
      program_id, week_number, day_number, position, title, workout_mode, split, notes
    ) values (
      new_program_id, w_row.week_number, w_row.day_number, w_row.position,
      w_row.title, w_row.workout_mode, w_row.split, w_row.notes
    ) returning id into new_workout_id;

    insert into public.program_workout_exercises (
      program_workout_id, position, exercise, set_type, target_sets,
      target_reps_min, target_reps_max, target_rir, target_weight_kg, rest_seconds, notes
    )
    select new_workout_id, position, exercise, set_type, target_sets,
      target_reps_min, target_reps_max, target_rir, target_weight_kg, rest_seconds, notes
    from public.program_workout_exercises
    where program_workout_id = w_row.id
    order by position;

    insert into public.program_workout_cardio (
      program_workout_id, position, activity, target_duration_min, notes
    )
    select new_workout_id, position, activity, target_duration_min, notes
    from public.program_workout_cardio
    where program_workout_id = w_row.id
    order by position;
  end loop;

  insert into public.enrollments (client_id, coach_id, program_id, status, assigned_by_coach, started_at)
  values (p_client_id, coach, new_program_id, 'active', true, now());

  return new_program_id;
end;
$$;


ALTER FUNCTION "public"."clone_program_for_client"("p_program_id" "uuid", "p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_actor_id" "uuid", "p_type" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_link" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if p_user_id is null or p_user_id = p_actor_id then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, payload, link)
  values (p_user_id, p_actor_id, p_type, coalesce(p_payload, '{}'::jsonb), p_link);
end;
$$;


ALTER FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_actor_id" "uuid", "p_type" "text", "p_payload" "jsonb", "p_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));
  delete from public.notifications where user_id = owner;
  delete from public.workout_feedback where author_id = owner;
  delete from public.weekly_checkins where client_id = owner;
  delete from public.enrollments where client_id = owner;
  delete from public.coach_client_notes where coach_id = owner;
  delete from public.programs where coach_id = owner;
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
  delete from public.progress_photos where user_id = owner;
  delete from public.offline_sync_receipts where user_id = owner;
  delete from public.google_drive_backups where user_id = owner;
end;
$$;


ALTER FUNCTION "public"."delete_my_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enroll_in_program"("p_program_id" "uuid", "p_invite_code" "text" DEFAULT NULL::"text", "p_share_nutrition" boolean DEFAULT true) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner uuid := auth.uid();
  prog public.programs%rowtype;
  next_status text;
  enrollment_id uuid;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  select * into prog from public.programs where id = p_program_id;
  if not found or prog.status <> 'published' or prog.assigned_client_id is not null then
    raise exception 'Program is not available for enrollment';
  end if;
  if prog.coach_id = owner then
    raise exception 'You cannot enroll in your own program';
  end if;
  if not public.is_coach(prog.coach_id) then
    raise exception 'Program coach is not active';
  end if;
  if prog.access_type = 'invite_only' then
    if prog.invite_code is null or prog.invite_code <> upper(trim(coalesce(p_invite_code, ''))) then
      raise exception 'Invalid invite code';
    end if;
  end if;

  if exists (
    select 1 from public.enrollments e
    where e.client_id = owner and e.program_id = prog.id and e.status in ('pending', 'active', 'paused')
  ) then
    raise exception 'Already enrolled in this program';
  end if;

  next_status := case when prog.requires_approval then 'pending' else 'active' end;
  insert into public.enrollments (client_id, coach_id, program_id, status, share_nutrition, assigned_by_coach, started_at)
  values (
    owner, prog.coach_id, prog.id, next_status, coalesce(p_share_nutrition, true), false,
    case when next_status = 'active' then now() else null end
  )
  returning id into enrollment_id;

  return enrollment_id;
end;
$$;


ALTER FUNCTION "public"."enroll_in_program"("p_program_id" "uuid", "p_invite_code" "text", "p_share_nutrition" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enrollments_guard_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  caller uuid := auth.uid();
begin
  if new.client_id is distinct from old.client_id or new.coach_id is distinct from old.coach_id then
    raise exception 'Cannot reassign enrollment ownership' using errcode = 'insufficient_privilege';
  end if;

  if caller is not null and coalesce(current_setting('replog.bypass_enrollment_guard', true), '') <> 'on' then
    if caller = old.client_id then
      if new.program_id is distinct from old.program_id
        or new.assigned_by_coach is distinct from old.assigned_by_coach
        or new.current_week is distinct from old.current_week
        or new.started_at is distinct from old.started_at
      then
        raise exception 'Clients can only update nutrition sharing or pause/complete an enrollment'
          using errcode = 'insufficient_privilege';
      end if;
      if new.status is distinct from old.status then
        if old.status = 'pending' or new.status not in ('paused', 'completed') then
          raise exception 'Invalid enrollment status transition for client'
            using errcode = 'insufficient_privilege';
        end if;
      end if;
    elsif caller = old.coach_id then
      if new.share_nutrition is distinct from old.share_nutrition then
        raise exception 'Only the client can change nutrition sharing'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  if new.status = 'active' and old.status is distinct from 'active' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."enrollments_guard_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, daily_steps_goal) values (new.id, 10000);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_food_id"("p_owner" "uuid", "p_old" "uuid", "p_barcode" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(
    (select f.id from public.foods f where p_barcode is not null and f.barcode = p_barcode and f.user_id is null),
    (select f.id from public.foods f where f.id = p_old and (f.user_id is null or f.user_id = p_owner)),
    extensions.uuid_generate_v5(p_owner, p_old::text)
  );
$$;


ALTER FUNCTION "public"."import_food_id"("p_owner" "uuid", "p_old" "uuid", "p_barcode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_my_data"("p_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."import_my_data"("p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_row_id"("p_owned" boolean, "p_owner" "uuid", "p_old" "uuid") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case when p_owned then p_old else extensions.uuid_generate_v5(p_owner, p_old::text) end;
$$;


ALTER FUNCTION "public"."import_row_id"("p_owned" boolean, "p_owner" "uuid", "p_old" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_coach_of"("p_client_id" "uuid", "p_coach_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.enrollments e
    join public.profiles p on p.id = e.coach_id and p.role = 'coach'
    where e.coach_id = p_coach_id
      and e.client_id = p_client_id
      and e.status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_active_coach_of"("p_client_id" "uuid", "p_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_coach_with_nutrition"("p_client_id" "uuid", "p_coach_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.enrollments e
    join public.profiles p on p.id = e.coach_id and p.role = 'coach'
    where e.coach_id = p_coach_id
      and e.client_id = p_client_id
      and e.status = 'active'
      and e.share_nutrition = true
  );
$$;


ALTER FUNCTION "public"."is_active_coach_with_nutrition"("p_client_id" "uuid", "p_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_coach"("p_uid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.role = 'coach'
  );
$$;


ALTER FUNCTION "public"."is_coach"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_enrollment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  prog_title text;
  client_name text;
begin
  if new.program_id is not null then
    select p.title into prog_title from public.programs p where p.id = new.program_id;
  end if;
  select coalesce(pr.display_name, '') into client_name from public.profiles pr where pr.id = new.client_id;

  if tg_op = 'INSERT' then
    if new.assigned_by_coach then
      perform public.create_notification(
        new.client_id, new.coach_id, 'program_assigned',
        jsonb_build_object('enrollment_id', new.id, 'program_id', new.program_id, 'program_title', coalesce(prog_title, '')),
        '/'
      );
    elsif new.status = 'pending' then
      perform public.create_notification(
        new.coach_id, new.client_id, 'enroll_requested',
        jsonb_build_object('enrollment_id', new.id, 'client_id', new.client_id, 'client_name', client_name, 'program_title', coalesce(prog_title, '')),
        '/coach'
      );
    elsif new.status = 'active' then
      perform public.create_notification(
        new.coach_id, new.client_id, 'enroll_approved',
        jsonb_build_object('enrollment_id', new.id, 'client_id', new.client_id, 'client_name', client_name, 'program_title', coalesce(prog_title, '')),
        '/coach/clients/' || new.client_id::text
      );
    end if;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if old.status = 'pending' and new.status = 'active' then
      perform public.create_notification(
        new.client_id, new.coach_id, 'enroll_approved',
        jsonb_build_object('enrollment_id', new.id, 'program_id', new.program_id, 'program_title', coalesce(prog_title, '')),
        '/'
      );
    elsif old.status = 'pending' and new.status = 'rejected' then
      perform public.create_notification(
        new.client_id, new.coach_id, 'enroll_rejected',
        jsonb_build_object('enrollment_id', new.id, 'program_id', new.program_id, 'program_title', coalesce(prog_title, '')),
        '/explore'
      );
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_enrollment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_weekly_checkin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  client_name text;
begin
  select coalesce(pr.display_name, '') into client_name from public.profiles pr where pr.id = new.client_id;
  perform public.create_notification(
    new.coach_id, new.client_id, 'weekly_checkin_submitted',
    jsonb_build_object('checkin_id', new.id, 'client_id', new.client_id, 'client_name', client_name, 'week_start', new.week_start),
    '/coach/clients/' || new.client_id::text
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_weekly_checkin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_workout_feedback"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  w_owner uuid;
  w_split text;
  w_date date;
  author_name text;
  c_id uuid;
begin
  select w.user_id, w.split, w.performed_on into w_owner, w_split, w_date
  from public.workouts w where w.id = new.workout_id;
  if w_owner is null then return new; end if;

  select coalesce(pr.display_name, '') into author_name from public.profiles pr where pr.id = new.author_id;

  if new.author_id <> w_owner then
    perform public.create_notification(
      w_owner, new.author_id, 'workout_feedback',
      jsonb_build_object('workout_id', new.workout_id, 'split', w_split, 'performed_on', w_date, 'author_name', author_name, 'reaction', new.reaction),
      '/history'
    );
  else
    for c_id in
      select distinct e.coach_id
      from public.enrollments e
      join public.profiles p on p.id = e.coach_id and p.role = 'coach'
      where e.client_id = w_owner and e.status = 'active'
    loop
      perform public.create_notification(
        c_id, new.author_id, 'workout_feedback',
        jsonb_build_object('workout_id', new.workout_id, 'client_id', w_owner, 'split', w_split, 'performed_on', w_date, 'author_name', author_name),
        '/coach/clients/' || w_owner::text
      );
    end loop;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_workout_feedback"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preview_program_by_invite"("p_code" "text") RETURNS TABLE("id" "uuid", "coach_id" "uuid", "coach_name" "text", "title" "text", "description" "text", "difficulty" "text", "duration_weeks" integer, "goal" "text", "requires_approval" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    pr.id,
    pr.coach_id,
    coalesce(cp.display_name, 'Coach') as coach_name,
    pr.title,
    pr.description,
    pr.difficulty,
    pr.duration_weeks,
    pr.goal,
    pr.requires_approval
  from public.programs pr
  left join public.coach_profiles cp on cp.user_id = pr.coach_id
  where auth.uid() is not null
    and pr.status = 'published'
    and pr.assigned_client_id is null
    and pr.invite_code = upper(trim(coalesce(p_code, '')))
  limit 1;
$$;


ALTER FUNCTION "public"."preview_program_by_invite"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_guard_role"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.role is distinct from old.role
    and auth.uid() is not null
    and coalesce(current_setting('replog.allow_role_change', true), '') <> 'on'
  then
    raise exception 'Role can only be changed via activate_coach_role'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_guard_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."progress_photos_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if (select count(*) from public.progress_photos where user_id = new.user_id) >= 200 then
    raise exception 'Photo limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."progress_photos_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_weekly_checkin"("p_checkin_id" "uuid", "p_reply" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  coach uuid := auth.uid();
  trimmed text := trim(coalesce(p_reply, ''));
  row_data public.weekly_checkins%rowtype;
begin
  if coach is null or not public.is_coach(coach) then
    raise exception 'Coach access required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trimmed) not between 1 and 1500 then
    raise exception 'Reply must be between 1 and 1500 characters';
  end if;

  select * into row_data from public.weekly_checkins where id = p_checkin_id;
  if not found or row_data.coach_id <> coach or not public.is_active_coach_of(row_data.client_id, coach) then
    raise exception 'Check-in not found or not authorized' using errcode = 'insufficient_privilege';
  end if;

  update public.weekly_checkins
  set coach_reply = trimmed,
      reviewed_at = now(),
      updated_at = now()
  where id = p_checkin_id;

  perform public.create_notification(
    row_data.client_id, coach, 'weekly_checkin_reviewed',
    jsonb_build_object('checkin_id', row_data.id, 'week_start', row_data.week_start),
    '/checkin/weekly'
  );
end;
$$;


ALTER FUNCTION "public"."review_weekly_checkin"("p_checkin_id" "uuid", "p_reply" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_workout"("p_mode" "text", "p_split" "text", "p_date" "date", "p_sets" "jsonb", "p_cardio" "jsonb", "p_program_workout_id" "uuid" DEFAULT NULL::"uuid", "p_enrollment_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner uuid := auth.uid();
  row_entry jsonb;
  bad_rir boolean;
  p_workout_id uuid;
  ex_name text;
  ex_weight numeric;
  ex_reps integer;
  ex_type text;
  prev_weight numeric;
  prev_reps integer;
  set_is_pr boolean;
  pr_exercises text[] := '{}';
  c_id uuid;
  client_name text;
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

  if p_enrollment_id is not null and not exists (
    select 1 from public.enrollments e where e.id = p_enrollment_id and e.client_id = owner
  ) then
    raise exception 'Invalid enrollment';
  end if;
  if p_program_workout_id is not null and not exists (
    select 1 from public.program_workouts pw
    where pw.id = p_program_workout_id and public.can_read_program_content(pw.program_id, owner)
  ) then
    raise exception 'Invalid program workout';
  end if;

  insert into public.workouts (user_id, workout_mode, split, performed_on, program_workout_id, enrollment_id)
    values (
      owner, p_mode,
      case when p_mode = 'strength' then p_split else 'CARDIO' end,
      p_date, p_program_workout_id, p_enrollment_id
    )
    returning id into p_workout_id;

  for row_entry in select value from jsonb_array_elements(p_sets) loop
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

    ex_name := row_entry->>'exercise';
    ex_weight := (row_entry->>'weight')::numeric;
    ex_reps := (row_entry->>'reps')::integer;
    ex_type := row_entry->>'setType';
    set_is_pr := false;

    if ex_type <> 'Warmup' then
      select s.weight, s.reps into prev_weight, prev_reps
      from public.workout_sets s
      where s.user_id = owner and s.exercise = ex_name and s.set_type <> 'Warmup'
      order by s.weight desc, s.reps desc
      limit 1;

      if found and (ex_weight > prev_weight or (ex_weight = prev_weight and ex_reps > prev_reps)) then
        set_is_pr := true;
        if not (ex_name = any(pr_exercises)) then
          pr_exercises := array_append(pr_exercises, ex_name);
        end if;
      end if;
    end if;

    insert into public.workout_sets (workout_id, user_id, split, exercise, set_number, reps, weight, rir, set_type, notes, is_pr)
      values (p_workout_id, owner, row_entry->>'split', ex_name,
        (row_entry->>'setNumber')::integer, ex_reps,
        ex_weight, (row_entry->>'rir')::integer,
        ex_type, nullif(row_entry->>'notes', ''), set_is_pr);
  end loop;

  for row_entry in select value from jsonb_array_elements(p_cardio) loop
    if length(coalesce(row_entry->>'activity', '')) not between 1 and 120
      or jsonb_typeof(row_entry->'durationMin') is distinct from 'number'
      or (row_entry->>'durationMin')::numeric not between 1 and 1440
      or trunc((row_entry->>'durationMin')::numeric) <> (row_entry->>'durationMin')::numeric
    then raise exception 'Invalid cardio entry'; end if;
    insert into public.cardio_sessions (workout_id, user_id, activity, duration_min)
      values (p_workout_id, owner, row_entry->>'activity', (row_entry->>'durationMin')::integer);
  end loop;

  if cardinality(pr_exercises) > 0 then
    select coalesce(pr.display_name, '') into client_name from public.profiles pr where pr.id = owner;
    for c_id in
      select distinct e.coach_id
      from public.enrollments e
      join public.profiles p on p.id = e.coach_id and p.role = 'coach'
      where e.client_id = owner and e.status = 'active'
    loop
      perform public.create_notification(
        c_id, owner, 'client_pr',
        jsonb_build_object('workout_id', p_workout_id, 'client_id', owner, 'client_name', client_name, 'exercises', to_jsonb(pr_exercises)),
        '/coach/clients/' || owner::text
      );
    end loop;
  end if;

  return p_workout_id;
end;
$$;


ALTER FUNCTION "public"."save_workout"("p_mode" "text", "p_split" "text", "p_date" "date", "p_sets" "jsonb", "p_cardio" "jsonb", "p_program_workout_id" "uuid", "p_enrollment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_workout_draft"("p_draft" "jsonb", "p_client_updated_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner uuid := auth.uid();
  saved boolean;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or pg_column_size(p_draft) > 1000000
    or p_client_updated_at is null or p_client_updated_at > now() + interval '1 day'
  then raise exception 'Invalid workout draft'; end if;

  insert into public.workout_drafts as existing (user_id, draft, client_updated_at)
    values (owner, p_draft, p_client_updated_at)
    on conflict (user_id) do update
      set draft = excluded.draft, client_updated_at = excluded.client_updated_at, updated_at = now()
      where existing.client_updated_at < excluded.client_updated_at;
  saved := found;
  if not saved then
    -- A retry of the already stored edit (for example after a lost reply) is still successful.
    select exists (
      select 1 from public.workout_drafts d
      where d.user_id = owner and d.client_updated_at = p_client_updated_at and d.draft = p_draft
    ) into saved;
  end if;
  return saved;
end;
$$;


ALTER FUNCTION "public"."save_workout_draft"("p_draft" "jsonb", "p_client_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_offline_entry"("mutation_id" "uuid", "entry" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  owner uuid := auth.uid();
  saved jsonb;
  kind text := entry->>'kind';
  entry_date date;
  row_entry jsonb;
  bad_rir boolean;
  ex_name text;
  ex_weight numeric;
  ex_reps integer;
  ex_type text;
  prev_weight numeric;
  prev_reps integer;
  set_is_pr boolean;
  pr_exercises text[] := '{}';
  c_id uuid;
  client_name text;
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

      ex_name := row_entry->>'exercise';
      ex_weight := (row_entry->>'weight')::numeric;
      ex_reps := (row_entry->>'reps')::integer;
      ex_type := row_entry->>'setType';
      set_is_pr := false;

      if ex_type <> 'Warmup' then
        select s.weight, s.reps into prev_weight, prev_reps
        from public.workout_sets s
        where s.user_id = owner and s.exercise = ex_name and s.set_type <> 'Warmup'
        order by s.weight desc, s.reps desc
        limit 1;

        if found and (ex_weight > prev_weight or (ex_weight = prev_weight and ex_reps > prev_reps)) then
          set_is_pr := true;
          if not (ex_name = any(pr_exercises)) then
            pr_exercises := array_append(pr_exercises, ex_name);
          end if;
        end if;
      end if;

      insert into public.workout_sets (workout_id, user_id, split, exercise, set_number, reps, weight, rir, set_type, notes, is_pr)
        values (mutation_id, owner, row_entry->>'split', ex_name,
          (row_entry->>'setNumber')::integer, ex_reps,
          ex_weight, (row_entry->>'rir')::integer,
          ex_type, nullif(row_entry->>'notes', ''), set_is_pr);
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

    if cardinality(pr_exercises) > 0 then
      select coalesce(pr.display_name, '') into client_name from public.profiles pr where pr.id = owner;
      for c_id in
        select distinct e.coach_id
        from public.enrollments e
        join public.profiles p on p.id = e.coach_id and p.role = 'coach'
        where e.client_id = owner and e.status = 'active'
      loop
        perform public.create_notification(
          c_id, owner, 'client_pr',
          jsonb_build_object('workout_id', mutation_id, 'client_id', owner, 'client_name', client_name, 'exercises', to_jsonb(pr_exercises)),
          '/coach/clients/' || owner::text
        );
      end loop;
    end if;
  else
    raise exception 'Unknown offline entry type';
  end if;
  insert into public.offline_sync_receipts (user_id, mutation_id, payload)
    values (owner, mutation_id, entry);
end;
$_$;


ALTER FUNCTION "public"."sync_offline_entry"("mutation_id" "uuid", "entry" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workout"("p_workout_id" "uuid", "p_mode" "text", "p_split" "text", "p_date" "date", "p_sets" "jsonb", "p_cardio" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."update_workout"("p_workout_id" "uuid", "p_mode" "text", "p_split" "text", "p_date" "date", "p_sets" "jsonb", "p_cardio" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."cardio_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "activity" "text" NOT NULL,
    "duration_min" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cardio_sessions_activity_check" CHECK ((("char_length"("activity") >= 1) AND ("char_length"("activity") <= 120))),
    CONSTRAINT "cardio_sessions_duration_min_check" CHECK ((("duration_min" > 0) AND ("duration_min" <= 1440)))
);


ALTER TABLE "public"."cardio_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_client_notes" (
    "coach_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_client_notes_check" CHECK (("coach_id" <> "client_id")),
    CONSTRAINT "coach_client_notes_note_check" CHECK (("char_length"("note") <= 4000))
);


ALTER TABLE "public"."coach_client_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_profiles" (
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "bio" "text",
    "specialties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "accepting_clients" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_profiles_bio_check" CHECK ((("bio" IS NULL) OR ("char_length"("bio") <= 1000))),
    CONSTRAINT "coach_profiles_display_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "display_name")) >= 1) AND ("char_length"(TRIM(BOTH FROM "display_name")) <= 80))),
    CONSTRAINT "coach_profiles_specialties_check" CHECK (("cardinality"("specialties") <= 10))
);


ALTER TABLE "public"."coach_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_checkin" (
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "energy" smallint,
    "satiety" smallint,
    "sleep" smallint,
    "note" "text",
    CONSTRAINT "daily_checkin_check" CHECK ((("energy" IS NOT NULL) OR ("satiety" IS NOT NULL) OR ("sleep" IS NOT NULL) OR ("note" IS NOT NULL))),
    CONSTRAINT "daily_checkin_energy_check" CHECK ((("energy" >= 1) AND ("energy" <= 10))),
    CONSTRAINT "daily_checkin_note_check" CHECK (("char_length"("note") <= 280)),
    CONSTRAINT "daily_checkin_satiety_check" CHECK ((("satiety" >= 1) AND ("satiety" <= 10))),
    CONSTRAINT "daily_checkin_sleep_check" CHECK ((("sleep" >= 1) AND ("sleep" <= 10)))
);


ALTER TABLE "public"."daily_checkin" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "steps" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."daily_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_weight" (
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "weight_kg" numeric(6,2) NOT NULL,
    CONSTRAINT "daily_weight_weight_kg_check" CHECK ((("weight_kg" > (0)::numeric) AND ("weight_kg" < (10000)::numeric)))
);


ALTER TABLE "public"."daily_weight" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "program_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "share_nutrition" boolean DEFAULT true NOT NULL,
    "current_week" integer DEFAULT 1 NOT NULL,
    "assigned_by_coach" boolean DEFAULT false NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "enrollments_check" CHECK (("client_id" <> "coach_id")),
    CONSTRAINT "enrollments_current_week_check" CHECK ((("current_week" >= 1) AND ("current_week" <= 52))),
    CONSTRAINT "enrollments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."foods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "brand" "text",
    "barcode" "text",
    "kcal_per_100g" numeric DEFAULT 0 NOT NULL,
    "protein_per_100g" numeric DEFAULT 0 NOT NULL,
    "carbs_per_100g" numeric DEFAULT 0 NOT NULL,
    "fat_per_100g" numeric DEFAULT 0 NOT NULL,
    "saturated_fat_per_100g" numeric DEFAULT 0,
    "polyunsaturated_fat_per_100g" numeric DEFAULT 0,
    "fiber_per_100g" numeric DEFAULT 0,
    "sodium_mg_per_100g" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."foods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_drive_backups" (
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "refresh_token" "text" NOT NULL,
    "frequency" "text" DEFAULT 'off'::"text" NOT NULL,
    "last_backup_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "google_drive_backups_frequency_check" CHECK (("frequency" = ANY (ARRAY['off'::"text", 'daily'::"text", 'weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "google_drive_backups_last_error_check" CHECK (("char_length"("last_error") <= 1000))
);


ALTER TABLE "public"."google_drive_backups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meal_id" "uuid" NOT NULL,
    "food_id" "uuid" NOT NULL,
    "consumed_weight_g" numeric NOT NULL,
    "total_kcal" numeric DEFAULT 0 NOT NULL,
    "total_protein_g" numeric DEFAULT 0 NOT NULL,
    "total_carbs_g" numeric DEFAULT 0 NOT NULL,
    "total_fat_g" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."meal_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."meal_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "performed_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "meal_type" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "meals_meal_type_check" CHECK (("meal_type" = ANY (ARRAY['Breakfast'::"text", 'Lunch'::"text", 'Dinner'::"text", 'Snack'::"text"])))
);


ALTER TABLE "public"."meals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "link" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_link_check" CHECK ((("link" IS NULL) OR ("link" ~~ '/%'::"text"))),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['enroll_requested'::"text", 'enroll_approved'::"text", 'enroll_rejected'::"text", 'program_assigned'::"text", 'workout_feedback'::"text", 'weekly_checkin_submitted'::"text", 'weekly_checkin_reviewed'::"text", 'client_pr'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offline_sync_receipts" (
    "user_id" "uuid" NOT NULL,
    "mutation_id" "uuid" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."offline_sync_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "daily_steps_goal" integer DEFAULT 10000 NOT NULL,
    "display_name" "text",
    "height_cm" numeric(4,1),
    "birth_date" "date",
    "sex" "text",
    "weight_unit" "text" DEFAULT 'kg'::"text" NOT NULL,
    "activity_level" "text",
    "goal_kg_per_week" numeric(3,2) DEFAULT 0 NOT NULL,
    "role" "text" DEFAULT 'client'::"text" NOT NULL,
    CONSTRAINT "goal_positive" CHECK (("daily_steps_goal" > 0)),
    CONSTRAINT "profiles_activity_level_check" CHECK (("activity_level" = ANY (ARRAY['sedentary'::"text", 'light'::"text", 'moderate'::"text", 'active'::"text", 'very_active'::"text"]))),
    CONSTRAINT "profiles_birth_date_check" CHECK (("birth_date" >= '1900-01-01'::"date")),
    CONSTRAINT "profiles_display_name_check" CHECK ((("char_length"("display_name") >= 1) AND ("char_length"("display_name") <= 80))),
    CONSTRAINT "profiles_goal_kg_per_week_check" CHECK ((("goal_kg_per_week" >= ('-1'::integer)::numeric) AND ("goal_kg_per_week" <= (1)::numeric))),
    CONSTRAINT "profiles_height_cm_check" CHECK ((("height_cm" >= (50)::numeric) AND ("height_cm" <= (272)::numeric))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['client'::"text", 'coach'::"text"]))),
    CONSTRAINT "profiles_sex_check" CHECK (("sex" = ANY (ARRAY['male'::"text", 'female'::"text"]))),
    CONSTRAINT "profiles_weight_unit_check" CHECK (("weight_unit" = ANY (ARRAY['kg'::"text", 'lb'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_workout_cardio" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_workout_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "activity" "text" NOT NULL,
    "target_duration_min" integer NOT NULL,
    "notes" "text",
    CONSTRAINT "program_workout_cardio_activity_check" CHECK ((("char_length"(TRIM(BOTH FROM "activity")) >= 1) AND ("char_length"(TRIM(BOTH FROM "activity")) <= 120))),
    CONSTRAINT "program_workout_cardio_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 280))),
    CONSTRAINT "program_workout_cardio_position_check" CHECK (("position" >= 1)),
    CONSTRAINT "program_workout_cardio_target_duration_min_check" CHECK ((("target_duration_min" >= 1) AND ("target_duration_min" <= 1440)))
);


ALTER TABLE "public"."program_workout_cardio" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_workout_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_workout_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "exercise" "text" NOT NULL,
    "set_type" "text" DEFAULT 'Working Set'::"text" NOT NULL,
    "target_sets" integer NOT NULL,
    "target_reps_min" integer NOT NULL,
    "target_reps_max" integer NOT NULL,
    "target_rir" smallint,
    "target_weight_kg" numeric(7,2),
    "rest_seconds" integer,
    "notes" "text",
    CONSTRAINT "program_workout_exercises_check" CHECK ((("target_reps_max" >= "target_reps_min") AND ("target_reps_max" <= 1000))),
    CONSTRAINT "program_workout_exercises_exercise_check" CHECK ((("char_length"(TRIM(BOTH FROM "exercise")) >= 1) AND ("char_length"(TRIM(BOTH FROM "exercise")) <= 300))),
    CONSTRAINT "program_workout_exercises_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 280))),
    CONSTRAINT "program_workout_exercises_position_check" CHECK (("position" >= 1)),
    CONSTRAINT "program_workout_exercises_rest_seconds_check" CHECK ((("rest_seconds" IS NULL) OR (("rest_seconds" >= 10) AND ("rest_seconds" <= 900)))),
    CONSTRAINT "program_workout_exercises_set_type_check" CHECK ((("char_length"(TRIM(BOTH FROM "set_type")) >= 1) AND ("char_length"(TRIM(BOTH FROM "set_type")) <= 100))),
    CONSTRAINT "program_workout_exercises_target_reps_min_check" CHECK ((("target_reps_min" >= 1) AND ("target_reps_min" <= 1000))),
    CONSTRAINT "program_workout_exercises_target_rir_check" CHECK ((("target_rir" IS NULL) OR (("target_rir" >= 0) AND ("target_rir" <= 5)))),
    CONSTRAINT "program_workout_exercises_target_sets_check" CHECK ((("target_sets" >= 1) AND ("target_sets" <= 50))),
    CONSTRAINT "program_workout_exercises_target_weight_kg_check" CHECK ((("target_weight_kg" IS NULL) OR (("target_weight_kg" >= (0)::numeric) AND ("target_weight_kg" <= (10000)::numeric))))
);


ALTER TABLE "public"."program_workout_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "week_number" integer DEFAULT 1 NOT NULL,
    "day_number" integer NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    "title" "text" NOT NULL,
    "workout_mode" "text" DEFAULT 'strength'::"text" NOT NULL,
    "split" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_workouts_day_number_check" CHECK ((("day_number" >= 1) AND ("day_number" <= 7))),
    CONSTRAINT "program_workouts_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 1000))),
    CONSTRAINT "program_workouts_position_check" CHECK (("position" >= 1)),
    CONSTRAINT "program_workouts_split_check" CHECK ((("char_length"(TRIM(BOTH FROM "split")) >= 1) AND ("char_length"(TRIM(BOTH FROM "split")) <= 100))),
    CONSTRAINT "program_workouts_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 1) AND ("char_length"(TRIM(BOTH FROM "title")) <= 120))),
    CONSTRAINT "program_workouts_week_number_check" CHECK ((("week_number" >= 1) AND ("week_number" <= 52))),
    CONSTRAINT "program_workouts_workout_mode_check" CHECK (("workout_mode" = ANY (ARRAY['strength'::"text", 'cardio'::"text"])))
);


ALTER TABLE "public"."program_workouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "assigned_client_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "difficulty" "text" DEFAULT 'intermediate'::"text" NOT NULL,
    "duration_weeks" integer DEFAULT 4 NOT NULL,
    "goal" "text" DEFAULT 'hypertrophy'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "access_type" "text" DEFAULT 'public'::"text" NOT NULL,
    "requires_approval" boolean DEFAULT false NOT NULL,
    "invite_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "programs_access_type_check" CHECK (("access_type" = ANY (ARRAY['public'::"text", 'invite_only'::"text"]))),
    CONSTRAINT "programs_check" CHECK ((("assigned_client_id" IS NULL) OR ("assigned_client_id" <> "coach_id"))),
    CONSTRAINT "programs_check1" CHECK ((("assigned_client_id" IS NULL) OR ("access_type" = 'invite_only'::"text"))),
    CONSTRAINT "programs_description_check" CHECK ((("description" IS NULL) OR ("char_length"("description") <= 2000))),
    CONSTRAINT "programs_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"]))),
    CONSTRAINT "programs_duration_weeks_check" CHECK ((("duration_weeks" >= 1) AND ("duration_weeks" <= 52))),
    CONSTRAINT "programs_goal_check" CHECK (("goal" = ANY (ARRAY['hypertrophy'::"text", 'strength'::"text", 'fat_loss'::"text", 'endurance'::"text", 'general_fitness'::"text"]))),
    CONSTRAINT "programs_invite_code_check" CHECK ((("invite_code" IS NULL) OR ("invite_code" ~ '^[A-Z0-9]{6,16}$'::"text"))),
    CONSTRAINT "programs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "programs_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 1) AND ("char_length"(TRIM(BOTH FROM "title")) <= 120)))
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progress_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "taken_on" "date" NOT NULL,
    "pose" "text" DEFAULT 'front'::"text" NOT NULL,
    "note" "text",
    "path" "text" NOT NULL,
    "size_bytes" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "progress_photos_check" CHECK (("path" = (((("user_id")::"text" || '/'::"text") || ("id")::"text") || '.jpg'::"text"))),
    CONSTRAINT "progress_photos_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 280))),
    CONSTRAINT "progress_photos_pose_check" CHECK (("pose" = ANY (ARRAY['front'::"text", 'side'::"text", 'back'::"text", 'other'::"text"]))),
    CONSTRAINT "progress_photos_size_bytes_check" CHECK ((("size_bytes" > 0) AND ("size_bytes" <= 5242880)))
);


ALTER TABLE "public"."progress_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_targets" (
    "user_id" "uuid" NOT NULL,
    "kcal" integer DEFAULT 2200 NOT NULL,
    "protein" integer DEFAULT 160 NOT NULL,
    "carbs" integer DEFAULT 250 NOT NULL,
    "fat" integer DEFAULT 70 NOT NULL,
    "fiber" integer DEFAULT 30 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."user_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "enrollment_id" "uuid",
    "week_start" "date" NOT NULL,
    "weight_kg" numeric(6,2),
    "energy" smallint NOT NULL,
    "sleep" smallint NOT NULL,
    "stress" smallint NOT NULL,
    "client_notes" "text",
    "coach_reply" "text",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "weekly_checkins_check" CHECK (("client_id" <> "coach_id")),
    CONSTRAINT "weekly_checkins_client_notes_check" CHECK ((("client_notes" IS NULL) OR ("char_length"("client_notes") <= 1500))),
    CONSTRAINT "weekly_checkins_coach_reply_check" CHECK ((("coach_reply" IS NULL) OR ("char_length"("coach_reply") <= 1500))),
    CONSTRAINT "weekly_checkins_energy_check" CHECK ((("energy" >= 1) AND ("energy" <= 5))),
    CONSTRAINT "weekly_checkins_sleep_check" CHECK ((("sleep" >= 1) AND ("sleep" <= 5))),
    CONSTRAINT "weekly_checkins_stress_check" CHECK ((("stress" >= 1) AND ("stress" <= 5))),
    CONSTRAINT "weekly_checkins_weight_kg_check" CHECK ((("weight_kg" IS NULL) OR (("weight_kg" >= 0.01) AND ("weight_kg" <= 9999.99))))
);


ALTER TABLE "public"."weekly_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_drafts" (
    "user_id" "uuid" NOT NULL,
    "draft" "jsonb" NOT NULL,
    "client_updated_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workout_drafts_draft_check" CHECK ((("jsonb_typeof"("draft") = 'object'::"text") AND ("pg_column_size"("draft") <= 1000000)))
);


ALTER TABLE "public"."workout_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "reaction" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workout_feedback_body_check" CHECK ((("char_length"(TRIM(BOTH FROM "body")) >= 1) AND ("char_length"(TRIM(BOTH FROM "body")) <= 1000))),
    CONSTRAINT "workout_feedback_reaction_check" CHECK ((("reaction" IS NULL) OR ("reaction" = ANY (ARRAY['fire'::"text", 'trophy'::"text", 'muscle'::"text", 'check'::"text", 'clap'::"text"]))))
);


ALTER TABLE "public"."workout_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_sets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "split" "text" NOT NULL,
    "exercise" "text" NOT NULL,
    "set_number" integer NOT NULL,
    "reps" integer NOT NULL,
    "rir" integer,
    "set_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weight" numeric(7,2) DEFAULT 0 NOT NULL,
    "notes" character varying,
    "is_pr" boolean DEFAULT false NOT NULL,
    CONSTRAINT "workout_sets_notes_check" CHECK (("length"(("notes")::"text") < 100)),
    CONSTRAINT "workout_sets_reps_check" CHECK (("reps" >= 0)),
    CONSTRAINT "workout_sets_rir_check" CHECK ((("rir" >= 0) AND ("rir" <= 5))),
    CONSTRAINT "workout_sets_set_number_check" CHECK (("set_number" >= 1)),
    CONSTRAINT "workout_sets_weight_check" CHECK ((("weight" >= (0)::numeric) AND ("weight" <= (10000)::numeric)))
);


ALTER TABLE "public"."workout_sets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "performed_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "split" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_id" "text",
    "workout_mode" "text" DEFAULT 'strength'::"text" NOT NULL,
    "program_workout_id" "uuid",
    "enrollment_id" "uuid",
    CONSTRAINT "workouts_workout_mode_check" CHECK (("workout_mode" = ANY (ARRAY['strength'::"text", 'cardio'::"text"])))
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cardio_sessions"
    ADD CONSTRAINT "cardio_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_client_notes"
    ADD CONSTRAINT "coach_client_notes_pkey" PRIMARY KEY ("coach_id", "client_id");



ALTER TABLE ONLY "public"."coach_profiles"
    ADD CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."daily_checkin"
    ADD CONSTRAINT "daily_checkin_pkey" PRIMARY KEY ("user_id", "date");



ALTER TABLE ONLY "public"."daily_steps"
    ADD CONSTRAINT "daily_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_steps"
    ADD CONSTRAINT "daily_steps_user_id_date_key" UNIQUE ("user_id", "date");



ALTER TABLE ONLY "public"."daily_weight"
    ADD CONSTRAINT "daily_weight_pkey" PRIMARY KEY ("user_id", "date");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_drive_backups"
    ADD CONSTRAINT "google_drive_backups_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_templates"
    ADD CONSTRAINT "meal_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offline_sync_receipts"
    ADD CONSTRAINT "offline_sync_receipts_pkey" PRIMARY KEY ("user_id", "mutation_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_workout_cardio"
    ADD CONSTRAINT "program_workout_cardio_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_workout_exercises"
    ADD CONSTRAINT "program_workout_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_workouts"
    ADD CONSTRAINT "program_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_path_key" UNIQUE ("path");



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_targets"
    ADD CONSTRAINT "user_targets_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_client_id_coach_id_week_start_key" UNIQUE ("client_id", "coach_id", "week_start");



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_drafts"
    ADD CONSTRAINT "workout_drafts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."workout_feedback"
    ADD CONSTRAINT "workout_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_sets"
    ADD CONSTRAINT "workout_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE INDEX "cardio_sessions_user_id_idx" ON "public"."cardio_sessions" USING "btree" ("user_id");



CREATE INDEX "cardio_sessions_workout_id_idx" ON "public"."cardio_sessions" USING "btree" ("workout_id");



CREATE INDEX "enrollments_client_status_idx" ON "public"."enrollments" USING "btree" ("client_id", "status");



CREATE INDEX "enrollments_coach_client_status_idx" ON "public"."enrollments" USING "btree" ("coach_id", "client_id", "status");



CREATE UNIQUE INDEX "enrollments_open_unique_idx" ON "public"."enrollments" USING "btree" ("client_id", "program_id") WHERE (("program_id" IS NOT NULL) AND ("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'paused'::"text"])));



CREATE INDEX "google_drive_backups_enabled_idx" ON "public"."google_drive_backups" USING "btree" ("frequency") WHERE ("frequency" <> 'off'::"text");



CREATE INDEX "notifications_user_recent_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_user_unread_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "program_workout_cardio_idx" ON "public"."program_workout_cardio" USING "btree" ("program_workout_id", "position");



CREATE INDEX "program_workout_exercises_idx" ON "public"."program_workout_exercises" USING "btree" ("program_workout_id", "position");



CREATE INDEX "program_workouts_program_idx" ON "public"."program_workouts" USING "btree" ("program_id", "week_number", "day_number", "position");



CREATE INDEX "programs_coach_id_idx" ON "public"."programs" USING "btree" ("coach_id", "status");



CREATE INDEX "programs_public_idx" ON "public"."programs" USING "btree" ("status", "access_type") WHERE (("status" = 'published'::"text") AND ("access_type" = 'public'::"text") AND ("assigned_client_id" IS NULL));



CREATE INDEX "progress_photos_user_date_idx" ON "public"."progress_photos" USING "btree" ("user_id", "taken_on" DESC);



CREATE INDEX "weekly_checkins_client_idx" ON "public"."weekly_checkins" USING "btree" ("client_id", "week_start" DESC);



CREATE INDEX "weekly_checkins_coach_idx" ON "public"."weekly_checkins" USING "btree" ("coach_id", "week_start" DESC);



CREATE INDEX "workout_feedback_workout_idx" ON "public"."workout_feedback" USING "btree" ("workout_id", "created_at");



CREATE INDEX "workout_sets_pr_idx" ON "public"."workout_sets" USING "btree" ("user_id", "created_at" DESC) WHERE ("is_pr" = true);



CREATE INDEX "workout_sets_workout_id_idx" ON "public"."workout_sets" USING "btree" ("workout_id");



CREATE INDEX "workouts_enrollment_idx" ON "public"."workouts" USING "btree" ("enrollment_id", "performed_on" DESC) WHERE ("enrollment_id" IS NOT NULL);



CREATE UNIQUE INDEX "workouts_user_client_id_uidx" ON "public"."workouts" USING "btree" ("user_id", "client_id") WHERE ("client_id" IS NOT NULL);



CREATE INDEX "workouts_user_id_idx" ON "public"."workouts" USING "btree" ("user_id", "performed_on" DESC, "created_at" DESC);



CREATE OR REPLACE TRIGGER "enrollments_guard_update" BEFORE UPDATE ON "public"."enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."enrollments_guard_update"();



CREATE OR REPLACE TRIGGER "notify_on_enrollment" AFTER INSERT OR UPDATE OF "status" ON "public"."enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_enrollment"();



CREATE OR REPLACE TRIGGER "notify_on_weekly_checkin" AFTER INSERT ON "public"."weekly_checkins" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_weekly_checkin"();



CREATE OR REPLACE TRIGGER "notify_on_workout_feedback" AFTER INSERT ON "public"."workout_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_workout_feedback"();



CREATE OR REPLACE TRIGGER "profiles_guard_role" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_guard_role"();



CREATE OR REPLACE TRIGGER "progress_photos_limit" BEFORE INSERT ON "public"."progress_photos" FOR EACH ROW EXECUTE FUNCTION "public"."progress_photos_limit"();



ALTER TABLE ONLY "public"."cardio_sessions"
    ADD CONSTRAINT "cardio_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cardio_sessions"
    ADD CONSTRAINT "cardio_sessions_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_client_notes"
    ADD CONSTRAINT "coach_client_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_client_notes"
    ADD CONSTRAINT "coach_client_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_profiles"
    ADD CONSTRAINT "coach_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_checkin"
    ADD CONSTRAINT "daily_checkin_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_steps"
    ADD CONSTRAINT "daily_steps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_weight"
    ADD CONSTRAINT "daily_weight_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_drive_backups"
    ADD CONSTRAINT "google_drive_backups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_templates"
    ADD CONSTRAINT "meal_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offline_sync_receipts"
    ADD CONSTRAINT "offline_sync_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_workout_cardio"
    ADD CONSTRAINT "program_workout_cardio_program_workout_id_fkey" FOREIGN KEY ("program_workout_id") REFERENCES "public"."program_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_workout_exercises"
    ADD CONSTRAINT "program_workout_exercises_program_workout_id_fkey" FOREIGN KEY ("program_workout_id") REFERENCES "public"."program_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_workouts"
    ADD CONSTRAINT "program_workouts_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_assigned_client_id_fkey" FOREIGN KEY ("assigned_client_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_targets"
    ADD CONSTRAINT "user_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_drafts"
    ADD CONSTRAINT "workout_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_feedback"
    ADD CONSTRAINT "workout_feedback_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_feedback"
    ADD CONSTRAINT "workout_feedback_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sets"
    ADD CONSTRAINT "workout_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sets"
    ADD CONSTRAINT "workout_sets_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_program_workout_id_fkey" FOREIGN KEY ("program_workout_id") REFERENCES "public"."program_workouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Permite stergerea antrenamentelor" ON "public"."workouts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Permite stergerea cardio" ON "public"."cardio_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Permite stergerea seturilor" ON "public"."workout_sets" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Produsele sunt vizibile pentru toată lumea sau propriile custo" ON "public"."foods" FOR SELECT USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can delete their own check-ins" ON "public"."daily_checkin" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own weight" ON "public"."daily_weight" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own check-ins" ON "public"."daily_checkin" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own weight" ON "public"."daily_weight" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read their own check-ins" ON "public"."daily_checkin" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read their own weight" ON "public"."daily_weight" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read their workout draft" ON "public"."workout_drafts" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own check-ins" ON "public"."daily_checkin" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own weight" ON "public"."daily_weight" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own cardio sessions" ON "public"."cardio_sessions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users pot edita doar propriile targeturi" ON "public"."user_targets" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Utilizatorii isi vad propriile sabloane" ON "public"."meal_templates" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Utilizatorii pot crea sabloane" ON "public"."meal_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Utilizatorii pot sterge sabloane" ON "public"."meal_templates" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Utilizatorii își pot actualiza proprii pași." ON "public"."daily_steps" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Utilizatorii își pot actualiza propriul profil." ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Utilizatorii își pot adăuga propriile produse custom." ON "public"."foods" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Utilizatorii își pot gestiona elementele meselor." ON "public"."meal_items" USING ((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "m"."user_id"
   FROM "public"."meals" "m"
  WHERE ("m"."id" = "meal_items"."meal_id")))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "m"."user_id"
   FROM "public"."meals" "m"
  WHERE ("m"."id" = "meal_items"."meal_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."foods" "f"
  WHERE (("f"."id" = "meal_items"."food_id") AND (("f"."user_id" IS NULL) OR ("f"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Utilizatorii își pot gestiona propriile mese." ON "public"."meals" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Utilizatorii își pot insera proprii pași." ON "public"."daily_steps" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Utilizatorii își pot vedea proprii pași." ON "public"."daily_steps" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Utilizatorii își pot vedea propriul profil." ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."cardio_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cardio_sessions_select_active_coach" ON "public"."cardio_sessions" FOR SELECT TO "authenticated" USING ("public"."is_active_coach_of"("user_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."coach_client_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_client_notes_coach_only" ON "public"."coach_client_notes" TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."coach_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_profiles_manage_own" ON "public"."coach_profiles" TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "coach_profiles_select" ON "public"."coach_profiles" FOR SELECT TO "authenticated" USING ((("is_public" = true) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."coach_id" = "coach_profiles"."user_id") AND ("e"."client_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("e"."status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text"])))))));



ALTER TABLE "public"."daily_checkin" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_checkin_select_active_coach" ON "public"."daily_checkin" FOR SELECT TO "authenticated" USING ("public"."is_active_coach_of"("user_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."daily_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_steps_select_active_coach" ON "public"."daily_steps" FOR SELECT TO "authenticated" USING ("public"."is_active_coach_of"("user_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."daily_weight" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_weight_select_active_coach" ON "public"."daily_weight" FOR SELECT TO "authenticated" USING ("public"."is_active_coach_of"("user_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."enrollments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "enrollments_delete_pending_client" ON "public"."enrollments" FOR DELETE TO "authenticated" USING ((("client_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text")));



CREATE POLICY "enrollments_select" ON "public"."enrollments" FOR SELECT TO "authenticated" USING ((("client_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "enrollments_update_client" ON "public"."enrollments" FOR UPDATE TO "authenticated" USING ((("client_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'paused'::"text"])))) WITH CHECK ((("client_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text"]))));



CREATE POLICY "enrollments_update_coach" ON "public"."enrollments" FOR UPDATE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."foods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "foods_select_active_coach" ON "public"."foods" FOR SELECT TO "authenticated" USING ((("user_id" IS NOT NULL) AND "public"."is_active_coach_with_nutrition"("user_id", ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."google_drive_backups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meal_items_select_active_coach" ON "public"."meal_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."meals" "m"
  WHERE (("m"."id" = "meal_items"."meal_id") AND "public"."is_active_coach_with_nutrition"("m"."user_id", ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."meal_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meals_select_active_coach" ON "public"."meals" FOR SELECT TO "authenticated" USING ("public"."is_active_coach_with_nutrition"("user_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_own" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."offline_sync_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_active_coach" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_active_coach_of"("id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."program_workout_cardio" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_workout_cardio_manage_coach" ON "public"."program_workout_cardio" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."program_workouts" "pw"
     JOIN "public"."programs" "p" ON (("p"."id" = "pw"."program_id")))
  WHERE (("pw"."id" = "program_workout_cardio"."program_workout_id") AND ("p"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."program_workouts" "pw"
     JOIN "public"."programs" "p" ON (("p"."id" = "pw"."program_id")))
  WHERE (("pw"."id" = "program_workout_cardio"."program_workout_id") AND ("p"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "program_workout_cardio_select" ON "public"."program_workout_cardio" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."program_workouts" "pw"
  WHERE (("pw"."id" = "program_workout_cardio"."program_workout_id") AND "public"."can_read_program_content"("pw"."program_id", ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."program_workout_exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_workout_exercises_manage_coach" ON "public"."program_workout_exercises" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."program_workouts" "pw"
     JOIN "public"."programs" "p" ON (("p"."id" = "pw"."program_id")))
  WHERE (("pw"."id" = "program_workout_exercises"."program_workout_id") AND ("p"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."program_workouts" "pw"
     JOIN "public"."programs" "p" ON (("p"."id" = "pw"."program_id")))
  WHERE (("pw"."id" = "program_workout_exercises"."program_workout_id") AND ("p"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "program_workout_exercises_select" ON "public"."program_workout_exercises" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."program_workouts" "pw"
  WHERE (("pw"."id" = "program_workout_exercises"."program_workout_id") AND "public"."can_read_program_content"("pw"."program_id", ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."program_workouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_workouts_manage_coach" ON "public"."program_workouts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_workouts"."program_id") AND ("p"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_workouts"."program_id") AND ("p"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "program_workouts_select" ON "public"."program_workouts" FOR SELECT TO "authenticated" USING ("public"."can_read_program_content"("program_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "programs_delete_coach" ON "public"."programs" FOR DELETE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "programs_insert_coach" ON "public"."programs" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid")) AND (("assigned_client_id" IS NULL) OR "public"."is_active_coach_of"("assigned_client_id", ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "programs_select" ON "public"."programs" FOR SELECT TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("status" = 'published'::"text") AND ("access_type" = 'public'::"text") AND ("assigned_client_id" IS NULL)) OR (EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."program_id" = "programs"."id") AND ("e"."client_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("e"."status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text"])))))));



CREATE POLICY "programs_update_coach" ON "public"."programs" FOR UPDATE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_coach"(( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."progress_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "progress_photos_delete_own" ON "public"."progress_photos" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "progress_photos_insert_own" ON "public"."progress_photos" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "progress_photos_select_own" ON "public"."progress_photos" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_targets_select_active_coach" ON "public"."user_targets" FOR SELECT TO "authenticated" USING ("public"."is_active_coach_with_nutrition"("user_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."weekly_checkins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weekly_checkins_delete_client" ON "public"."weekly_checkins" FOR DELETE TO "authenticated" USING ((("client_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("reviewed_at" IS NULL)));



CREATE POLICY "weekly_checkins_insert_client" ON "public"."weekly_checkins" FOR INSERT TO "authenticated" WITH CHECK ((("client_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_active_coach_of"("client_id", "coach_id") AND ("coach_reply" IS NULL) AND ("reviewed_at" IS NULL)));



CREATE POLICY "weekly_checkins_select" ON "public"."weekly_checkins" FOR SELECT TO "authenticated" USING ((("client_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_active_coach_of"("client_id", ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "weekly_checkins_update_client" ON "public"."weekly_checkins" FOR UPDATE TO "authenticated" USING ((("client_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("reviewed_at" IS NULL))) WITH CHECK ((("client_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("coach_reply" IS NULL) AND ("reviewed_at" IS NULL)));



ALTER TABLE "public"."workout_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_feedback_delete_own" ON "public"."workout_feedback" FOR DELETE TO "authenticated" USING (("author_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "workout_feedback_insert" ON "public"."workout_feedback" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."workouts" "w"
  WHERE (("w"."id" = "workout_feedback"."workout_id") AND (("w"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_active_coach_of"("w"."user_id", ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "workout_feedback_select" ON "public"."workout_feedback" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workouts" "w"
  WHERE (("w"."id" = "workout_feedback"."workout_id") AND (("w"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_active_coach_of"("w"."user_id", ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "workout_feedback_update_own" ON "public"."workout_feedback" FOR UPDATE TO "authenticated" USING (("author_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("author_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."workout_sets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_sets_delete_own" ON "public"."workout_sets" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workout_sets_insert_own" ON "public"."workout_sets" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."workouts" "w"
  WHERE (("w"."id" = "workout_sets"."workout_id") AND ("w"."user_id" = "auth"."uid"()))))));



CREATE POLICY "workout_sets_select_active_coach" ON "public"."workout_sets" FOR SELECT TO "authenticated" USING ("public"."is_active_coach_of"("user_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "workout_sets_select_own" ON "public"."workout_sets" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workout_sets_update_own" ON "public"."workout_sets" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workouts_delete_own" ON "public"."workouts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workouts_insert_own" ON "public"."workouts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "workouts_select_active_coach" ON "public"."workouts" FOR SELECT TO "authenticated" USING ("public"."is_active_coach_of"("user_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "workouts_select_own" ON "public"."workouts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workouts_update_own" ON "public"."workouts" FOR UPDATE USING (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."activate_coach_role"("p_display_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_coach_role"("p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_coach_role"("p_display_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_read_program"("p_program_id" "uuid", "p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_program"("p_program_id" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_program"("p_program_id" "uuid", "p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_read_program_content"("p_program_id" "uuid", "p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_program_content"("p_program_id" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_program_content"("p_program_id" "uuid", "p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clone_program_for_client"("p_program_id" "uuid", "p_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clone_program_for_client"("p_program_id" "uuid", "p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_program_for_client"("p_program_id" "uuid", "p_client_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_actor_id" "uuid", "p_type" "text", "p_payload" "jsonb", "p_link" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_actor_id" "uuid", "p_type" "text", "p_payload" "jsonb", "p_link" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_my_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_my_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enroll_in_program"("p_program_id" "uuid", "p_invite_code" "text", "p_share_nutrition" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enroll_in_program"("p_program_id" "uuid", "p_invite_code" "text", "p_share_nutrition" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enroll_in_program"("p_program_id" "uuid", "p_invite_code" "text", "p_share_nutrition" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."enrollments_guard_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."enrollments_guard_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enrollments_guard_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_food_id"("p_owner" "uuid", "p_old" "uuid", "p_barcode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_food_id"("p_owner" "uuid", "p_old" "uuid", "p_barcode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_my_data"("p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_my_data"("p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_my_data"("p_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_row_id"("p_owned" boolean, "p_owner" "uuid", "p_old" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_row_id"("p_owned" boolean, "p_owner" "uuid", "p_old" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_coach_of"("p_client_id" "uuid", "p_coach_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_coach_of"("p_client_id" "uuid", "p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_coach_of"("p_client_id" "uuid", "p_coach_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_coach_with_nutrition"("p_client_id" "uuid", "p_coach_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_coach_with_nutrition"("p_client_id" "uuid", "p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_coach_with_nutrition"("p_client_id" "uuid", "p_coach_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_coach"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_coach"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_coach"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_enrollment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_enrollment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_weekly_checkin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_weekly_checkin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_workout_feedback"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_workout_feedback"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."preview_program_by_invite"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preview_program_by_invite"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."preview_program_by_invite"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_guard_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_guard_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_guard_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."progress_photos_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."progress_photos_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."progress_photos_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_weekly_checkin"("p_checkin_id" "uuid", "p_reply" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_weekly_checkin"("p_checkin_id" "uuid", "p_reply" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_weekly_checkin"("p_checkin_id" "uuid", "p_reply" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_workout"("p_mode" "text", "p_split" "text", "p_date" "date", "p_sets" "jsonb", "p_cardio" "jsonb", "p_program_workout_id" "uuid", "p_enrollment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_workout"("p_mode" "text", "p_split" "text", "p_date" "date", "p_sets" "jsonb", "p_cardio" "jsonb", "p_program_workout_id" "uuid", "p_enrollment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_workout"("p_mode" "text", "p_split" "text", "p_date" "date", "p_sets" "jsonb", "p_cardio" "jsonb", "p_program_workout_id" "uuid", "p_enrollment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_workout_draft"("p_draft" "jsonb", "p_client_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_workout_draft"("p_draft" "jsonb", "p_client_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_workout_draft"("p_draft" "jsonb", "p_client_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_offline_entry"("mutation_id" "uuid", "entry" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_offline_entry"("mutation_id" "uuid", "entry" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_offline_entry"("mutation_id" "uuid", "entry" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_workout"("p_workout_id" "uuid", "p_mode" "text", "p_split" "text", "p_date" "date", "p_sets" "jsonb", "p_cardio" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_workout"("p_workout_id" "uuid", "p_mode" "text", "p_split" "text", "p_date" "date", "p_sets" "jsonb", "p_cardio" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_workout"("p_workout_id" "uuid", "p_mode" "text", "p_split" "text", "p_date" "date", "p_sets" "jsonb", "p_cardio" "jsonb") TO "service_role";


















GRANT ALL ON TABLE "public"."cardio_sessions" TO "anon";
GRANT ALL ON TABLE "public"."cardio_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."cardio_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."coach_client_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_client_notes" TO "service_role";



GRANT ALL ON TABLE "public"."coach_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."daily_checkin" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_checkin" TO "service_role";



GRANT ALL ON TABLE "public"."daily_steps" TO "anon";
GRANT ALL ON TABLE "public"."daily_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_steps" TO "service_role";



GRANT ALL ON TABLE "public"."daily_weight" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_weight" TO "service_role";



GRANT ALL ON TABLE "public"."enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."foods" TO "anon";
GRANT ALL ON TABLE "public"."foods" TO "authenticated";
GRANT ALL ON TABLE "public"."foods" TO "service_role";



GRANT ALL ON TABLE "public"."google_drive_backups" TO "service_role";



GRANT ALL ON TABLE "public"."meal_items" TO "anon";
GRANT ALL ON TABLE "public"."meal_items" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_items" TO "service_role";



GRANT ALL ON TABLE "public"."meal_templates" TO "anon";
GRANT ALL ON TABLE "public"."meal_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_templates" TO "service_role";



GRANT ALL ON TABLE "public"."meals" TO "anon";
GRANT ALL ON TABLE "public"."meals" TO "authenticated";
GRANT ALL ON TABLE "public"."meals" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."offline_sync_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."program_workout_cardio" TO "authenticated";
GRANT ALL ON TABLE "public"."program_workout_cardio" TO "service_role";



GRANT ALL ON TABLE "public"."program_workout_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."program_workout_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."program_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."program_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON TABLE "public"."progress_photos" TO "anon";
GRANT ALL ON TABLE "public"."progress_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_photos" TO "service_role";



GRANT ALL ON TABLE "public"."user_targets" TO "anon";
GRANT ALL ON TABLE "public"."user_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."user_targets" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."workout_drafts" TO "service_role";
GRANT SELECT ON TABLE "public"."workout_drafts" TO "authenticated";



GRANT ALL ON TABLE "public"."workout_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."workout_sets" TO "anon";
GRANT ALL ON TABLE "public"."workout_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_sets" TO "service_role";



GRANT ALL ON TABLE "public"."workouts" TO "anon";
GRANT ALL ON TABLE "public"."workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."workouts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































