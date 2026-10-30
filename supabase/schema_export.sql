


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."delete_my_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  delete from public.offline_sync_receipts where user_id = owner;
end;
$$;


ALTER FUNCTION "public"."delete_my_data"() OWNER TO "postgres";


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
    'meal_items', 'meal_templates', 'daily_steps', 'daily_weight'] loop
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
$_$;


ALTER FUNCTION "public"."sync_offline_entry"("mutation_id" "uuid", "entry" "jsonb") OWNER TO "postgres";

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
    CONSTRAINT "goal_positive" CHECK (("daily_steps_goal" > 0)),
    CONSTRAINT "profiles_activity_level_check" CHECK (("activity_level" = ANY (ARRAY['sedentary'::"text", 'light'::"text", 'moderate'::"text", 'active'::"text", 'very_active'::"text"]))),
    CONSTRAINT "profiles_birth_date_check" CHECK (("birth_date" >= '1900-01-01'::"date")),
    CONSTRAINT "profiles_display_name_check" CHECK ((("char_length"("display_name") >= 1) AND ("char_length"("display_name") <= 80))),
    CONSTRAINT "profiles_goal_kg_per_week_check" CHECK ((("goal_kg_per_week" >= ('-1'::integer)::numeric) AND ("goal_kg_per_week" <= (1)::numeric))),
    CONSTRAINT "profiles_height_cm_check" CHECK ((("height_cm" >= (50)::numeric) AND ("height_cm" <= (272)::numeric))),
    CONSTRAINT "profiles_sex_check" CHECK (("sex" = ANY (ARRAY['male'::"text", 'female'::"text"]))),
    CONSTRAINT "profiles_weight_unit_check" CHECK (("weight_unit" = ANY (ARRAY['kg'::"text", 'lb'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."workout_drafts" (
    "user_id" "uuid" NOT NULL,
    "draft" "jsonb" NOT NULL,
    "client_updated_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workout_drafts_draft_check" CHECK ((("jsonb_typeof"("draft") = 'object'::"text") AND ("pg_column_size"("draft") <= 1000000)))
);


ALTER TABLE "public"."workout_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_sets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "split" "text" NOT NULL,
    "exercise" "text" NOT NULL,
    "set_number" integer NOT NULL,
    "reps" integer NOT NULL,
    "rir" integer NOT NULL,
    "set_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weight" numeric(7,2) DEFAULT 0 NOT NULL,
    "notes" character varying,
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
    CONSTRAINT "workouts_workout_mode_check" CHECK (("workout_mode" = ANY (ARRAY['strength'::"text", 'cardio'::"text"])))
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cardio_sessions"
    ADD CONSTRAINT "cardio_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_steps"
    ADD CONSTRAINT "daily_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_steps"
    ADD CONSTRAINT "daily_steps_user_id_date_key" UNIQUE ("user_id", "date");



ALTER TABLE ONLY "public"."daily_weight"
    ADD CONSTRAINT "daily_weight_pkey" PRIMARY KEY ("user_id", "date");



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_templates"
    ADD CONSTRAINT "meal_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offline_sync_receipts"
    ADD CONSTRAINT "offline_sync_receipts_pkey" PRIMARY KEY ("user_id", "mutation_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_targets"
    ADD CONSTRAINT "user_targets_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."workout_drafts"
    ADD CONSTRAINT "workout_drafts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."workout_sets"
    ADD CONSTRAINT "workout_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE INDEX "cardio_sessions_user_id_idx" ON "public"."cardio_sessions" USING "btree" ("user_id");



CREATE INDEX "cardio_sessions_workout_id_idx" ON "public"."cardio_sessions" USING "btree" ("workout_id");



CREATE INDEX "workout_sets_workout_id_idx" ON "public"."workout_sets" USING "btree" ("workout_id");



CREATE UNIQUE INDEX "workouts_user_client_id_uidx" ON "public"."workouts" USING "btree" ("user_id", "client_id") WHERE ("client_id" IS NOT NULL);



CREATE INDEX "workouts_user_id_idx" ON "public"."workouts" USING "btree" ("user_id", "performed_on" DESC, "created_at" DESC);



ALTER TABLE ONLY "public"."cardio_sessions"
    ADD CONSTRAINT "cardio_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cardio_sessions"
    ADD CONSTRAINT "cardio_sessions_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_steps"
    ADD CONSTRAINT "daily_steps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_weight"
    ADD CONSTRAINT "daily_weight_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_templates"
    ADD CONSTRAINT "meal_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offline_sync_receipts"
    ADD CONSTRAINT "offline_sync_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_targets"
    ADD CONSTRAINT "user_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_drafts"
    ADD CONSTRAINT "workout_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sets"
    ADD CONSTRAINT "workout_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sets"
    ADD CONSTRAINT "workout_sets_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Permite stergerea antrenamentelor" ON "public"."workouts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Permite stergerea cardio" ON "public"."cardio_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Permite stergerea seturilor" ON "public"."workout_sets" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Produsele sunt vizibile pentru toată lumea sau propriile custo" ON "public"."foods" FOR SELECT USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can delete their own weight" ON "public"."daily_weight" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own weight" ON "public"."daily_weight" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read their own weight" ON "public"."daily_weight" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read their workout draft" ON "public"."workout_drafts" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



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


ALTER TABLE "public"."daily_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_weight" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."offline_sync_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_sets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_sets_delete_own" ON "public"."workout_sets" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workout_sets_insert_own" ON "public"."workout_sets" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."workouts" "w"
  WHERE (("w"."id" = "workout_sets"."workout_id") AND ("w"."user_id" = "auth"."uid"()))))));



CREATE POLICY "workout_sets_select_own" ON "public"."workout_sets" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workout_sets_update_own" ON "public"."workout_sets" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workouts_delete_own" ON "public"."workouts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workouts_insert_own" ON "public"."workouts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "workouts_select_own" ON "public"."workouts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "workouts_update_own" ON "public"."workouts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_my_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_my_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_food_id"("p_owner" "uuid", "p_old" "uuid", "p_barcode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_food_id"("p_owner" "uuid", "p_old" "uuid", "p_barcode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_my_data"("p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_my_data"("p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_my_data"("p_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_row_id"("p_owned" boolean, "p_owner" "uuid", "p_old" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_row_id"("p_owned" boolean, "p_owner" "uuid", "p_old" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_workout_draft"("p_draft" "jsonb", "p_client_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_workout_draft"("p_draft" "jsonb", "p_client_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_workout_draft"("p_draft" "jsonb", "p_client_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_offline_entry"("mutation_id" "uuid", "entry" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_offline_entry"("mutation_id" "uuid", "entry" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_offline_entry"("mutation_id" "uuid", "entry" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."cardio_sessions" TO "anon";
GRANT ALL ON TABLE "public"."cardio_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."cardio_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_steps" TO "anon";
GRANT ALL ON TABLE "public"."daily_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_steps" TO "service_role";



GRANT ALL ON TABLE "public"."daily_weight" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_weight" TO "service_role";



GRANT ALL ON TABLE "public"."foods" TO "anon";
GRANT ALL ON TABLE "public"."foods" TO "authenticated";
GRANT ALL ON TABLE "public"."foods" TO "service_role";



GRANT ALL ON TABLE "public"."meal_items" TO "anon";
GRANT ALL ON TABLE "public"."meal_items" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_items" TO "service_role";



GRANT ALL ON TABLE "public"."meal_templates" TO "anon";
GRANT ALL ON TABLE "public"."meal_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_templates" TO "service_role";



GRANT ALL ON TABLE "public"."meals" TO "anon";
GRANT ALL ON TABLE "public"."meals" TO "authenticated";
GRANT ALL ON TABLE "public"."meals" TO "service_role";



GRANT ALL ON TABLE "public"."offline_sync_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_targets" TO "anon";
GRANT ALL ON TABLE "public"."user_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."user_targets" TO "service_role";



GRANT ALL ON TABLE "public"."workout_drafts" TO "service_role";
GRANT SELECT ON TABLE "public"."workout_drafts" TO "authenticated";



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







