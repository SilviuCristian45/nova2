begin;

-- ============================================================================
-- Phase 1: Coach role (RBAC), Programs/Courses, Enrollments, Coach Notes,
-- Workout Feedback, Weekly Check-ins, In-App Notifications, and RLS policies.
-- ============================================================================

-- 1. RBAC on profiles + dedicated public coach profile directory
alter table public.profiles
  add column if not exists role text not null default 'client'
    check (role in ('client', 'coach'));

-- Prevent clients from directly editing profiles.role via PostgREST UPDATE.
-- Role promotion goes through public.activate_coach_role() (or SQL admin).
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
set search_path = ''
as $$
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

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.profiles_guard_role();

-- Public coach directory entry (keeps profiles.birth_date/height_cm/sex private).
create table if not exists public.coach_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  bio text check (bio is null or char_length(bio) <= 1000),
  specialties text[] not null default '{}' check (cardinality(specialties) <= 10),
  is_public boolean not null default false,
  accepting_clients boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. Programs / Courses & Workout Templates
-- ============================================================================
create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  assigned_client_id uuid references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  difficulty text not null default 'intermediate'
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  duration_weeks integer not null default 4 check (duration_weeks between 1 and 52),
  goal text not null default 'hypertrophy'
    check (goal in ('hypertrophy', 'strength', 'fat_loss', 'endurance', 'general_fitness')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  access_type text not null default 'public'
    check (access_type in ('public', 'invite_only')),
  requires_approval boolean not null default false,
  invite_code text unique check (invite_code is null or invite_code ~ '^[A-Z0-9]{6,16}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (assigned_client_id is null or assigned_client_id <> coach_id),
  check (assigned_client_id is null or access_type = 'invite_only')
);
create index if not exists programs_coach_id_idx on public.programs (coach_id, status);
create index if not exists programs_public_idx on public.programs (status, access_type)
  where status = 'published' and access_type = 'public' and assigned_client_id is null;

create table if not exists public.program_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  week_number integer not null default 1 check (week_number between 1 and 52),
  day_number integer not null check (day_number between 1 and 7),
  position integer not null default 1 check (position >= 1),
  title text not null check (char_length(trim(title)) between 1 and 120),
  workout_mode text not null default 'strength' check (workout_mode in ('strength', 'cardio')),
  split text not null check (char_length(trim(split)) between 1 and 100),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists program_workouts_program_idx
  on public.program_workouts (program_id, week_number, day_number, position);

create table if not exists public.program_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  program_workout_id uuid not null references public.program_workouts(id) on delete cascade,
  position integer not null check (position >= 1),
  exercise text not null check (char_length(trim(exercise)) between 1 and 300),
  set_type text not null default 'Working Set' check (char_length(trim(set_type)) between 1 and 100),
  target_sets integer not null check (target_sets between 1 and 50),
  target_reps_min integer not null check (target_reps_min between 1 and 1000),
  target_reps_max integer not null check (target_reps_max >= target_reps_min and target_reps_max <= 1000),
  target_rir smallint check (target_rir is null or target_rir between 0 and 5),
  target_weight_kg numeric(7, 2) check (target_weight_kg is null or target_weight_kg between 0 and 10000),
  rest_seconds integer check (rest_seconds is null or rest_seconds between 10 and 900),
  notes text check (notes is null or char_length(notes) <= 280)
);
create index if not exists program_workout_exercises_idx
  on public.program_workout_exercises (program_workout_id, position);

create table if not exists public.program_workout_cardio (
  id uuid primary key default gen_random_uuid(),
  program_workout_id uuid not null references public.program_workouts(id) on delete cascade,
  position integer not null check (position >= 1),
  activity text not null check (char_length(trim(activity)) between 1 and 120),
  target_duration_min integer not null check (target_duration_min between 1 and 1440),
  notes text check (notes is null or char_length(notes) <= 280)
);
create index if not exists program_workout_cardio_idx
  on public.program_workout_cardio (program_workout_id, position);

-- ============================================================================
-- 3. Coach-Client Enrollments & Private Coach Notes
-- ============================================================================
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid references public.programs(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'completed', 'rejected')),
  share_nutrition boolean not null default true,
  current_week integer not null default 1 check (current_week between 1 and 52),
  assigned_by_coach boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id <> coach_id)
);
create index if not exists enrollments_coach_client_status_idx
  on public.enrollments (coach_id, client_id, status);
create index if not exists enrollments_client_status_idx
  on public.enrollments (client_id, status);
create unique index if not exists enrollments_open_unique_idx
  on public.enrollments (client_id, program_id)
  where program_id is not null and status in ('pending', 'active', 'paused');

create table if not exists public.coach_client_notes (
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (coach_id, client_id),
  check (coach_id <> client_id)
);

-- ============================================================================
-- 4. Link Logged Workouts to Programs + PR Flag on Sets
-- ============================================================================
alter table public.workouts
  add column if not exists program_workout_id uuid references public.program_workouts(id) on delete set null,
  add column if not exists enrollment_id uuid references public.enrollments(id) on delete set null;
create index if not exists workouts_enrollment_idx on public.workouts (enrollment_id, performed_on desc)
  where enrollment_id is not null;

alter table public.workout_sets
  add column if not exists is_pr boolean not null default false;
create index if not exists workout_sets_pr_idx on public.workout_sets (user_id, created_at desc)
  where is_pr = true;

-- ============================================================================
-- 5. Bidirectional Workout Feedback, Weekly Check-ins & In-App Notifications
-- ============================================================================
create table if not exists public.workout_feedback (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  reaction text check (reaction is null or reaction in ('fire', 'trophy', 'muscle', 'check', 'clap')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_feedback_workout_idx
  on public.workout_feedback (workout_id, created_at asc);

create table if not exists public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  week_start date not null,
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 0.01 and 9999.99),
  energy smallint not null check (energy between 1 and 5),
  sleep smallint not null check (sleep between 1 and 5),
  stress smallint not null check (stress between 1 and 5),
  client_notes text check (client_notes is null or char_length(client_notes) <= 1500),
  coach_reply text check (coach_reply is null or char_length(coach_reply) <= 1500),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, coach_id, week_start),
  check (client_id <> coach_id)
);
create index if not exists weekly_checkins_coach_idx
  on public.weekly_checkins (coach_id, week_start desc);
create index if not exists weekly_checkins_client_idx
  on public.weekly_checkins (client_id, week_start desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in (
    'enroll_requested', 'enroll_approved', 'enroll_rejected',
    'program_assigned', 'workout_feedback',
    'weekly_checkin_submitted', 'weekly_checkin_reviewed', 'client_pr'
  )),
  payload jsonb not null default '{}'::jsonb,
  link text check (link is null or link like '/%'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

-- ============================================================================
-- 6. SECURITY DEFINER Helper Functions (prevent RLS recursion)
-- ============================================================================
create or replace function public.is_coach(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.role = 'coach'
  );
$$;
revoke all on function public.is_coach(uuid) from public, anon;
grant execute on function public.is_coach(uuid) to authenticated;

create or replace function public.is_active_coach_of(p_client_id uuid, p_coach_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.profiles p on p.id = e.coach_id and p.role = 'coach'
    where e.coach_id = p_coach_id
      and e.client_id = p_client_id
      and e.status = 'active'
  );
$$;
revoke all on function public.is_active_coach_of(uuid, uuid) from public, anon;
grant execute on function public.is_active_coach_of(uuid, uuid) to authenticated;

create or replace function public.is_active_coach_with_nutrition(p_client_id uuid, p_coach_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
revoke all on function public.is_active_coach_with_nutrition(uuid, uuid) from public, anon;
grant execute on function public.is_active_coach_with_nutrition(uuid, uuid) to authenticated;

create or replace function public.can_read_program(p_program_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
revoke all on function public.can_read_program(uuid, uuid) from public, anon;
grant execute on function public.can_read_program(uuid, uuid) to authenticated;

create or replace function public.can_read_program_content(p_program_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
revoke all on function public.can_read_program_content(uuid, uuid) from public, anon;
grant execute on function public.can_read_program_content(uuid, uuid) to authenticated;

-- Internal notification writer: never callable directly from clients.
create or replace function public.create_notification(
  p_user_id uuid, p_actor_id uuid, p_type text, p_payload jsonb default '{}'::jsonb, p_link text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_user_id = p_actor_id then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, payload, link)
  values (p_user_id, p_actor_id, p_type, coalesce(p_payload, '{}'::jsonb), p_link);
end;
$$;
revoke all on function public.create_notification(uuid, uuid, text, jsonb, text) from public, anon, authenticated;

-- ============================================================================
-- 7. Guard Triggers & Automatic Notification Triggers
-- ============================================================================
create or replace function public.enrollments_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
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

drop trigger if exists enrollments_guard_update on public.enrollments;
create trigger enrollments_guard_update
  before update on public.enrollments
  for each row execute function public.enrollments_guard_update();

create or replace function public.notify_on_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
revoke all on function public.notify_on_enrollment() from public, anon, authenticated;

drop trigger if exists notify_on_enrollment on public.enrollments;
create trigger notify_on_enrollment
  after insert or update of status on public.enrollments
  for each row execute function public.notify_on_enrollment();

create or replace function public.notify_on_workout_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
revoke all on function public.notify_on_workout_feedback() from public, anon, authenticated;

drop trigger if exists notify_on_workout_feedback on public.workout_feedback;
create trigger notify_on_workout_feedback
  after insert on public.workout_feedback
  for each row execute function public.notify_on_workout_feedback();

create or replace function public.notify_on_weekly_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
revoke all on function public.notify_on_weekly_checkin() from public, anon, authenticated;

drop trigger if exists notify_on_weekly_checkin on public.weekly_checkins;
create trigger notify_on_weekly_checkin
  after insert on public.weekly_checkins
  for each row execute function public.notify_on_weekly_checkin();

-- ============================================================================
-- 8. Dedicated RPCs (Coach role activation, invite preview/enroll, clone, checkin review)
-- ============================================================================
create or replace function public.activate_coach_role(p_display_name text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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
revoke all on function public.activate_coach_role(text) from public, anon;
grant execute on function public.activate_coach_role(text) to authenticated;

create or replace function public.preview_program_by_invite(p_code text)
returns table (
  id uuid,
  coach_id uuid,
  coach_name text,
  title text,
  description text,
  difficulty text,
  duration_weeks integer,
  goal text,
  requires_approval boolean
)
language sql
stable
security definer
set search_path = ''
as $$
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
revoke all on function public.preview_program_by_invite(text) from public, anon;
grant execute on function public.preview_program_by_invite(text) to authenticated;

create or replace function public.enroll_in_program(
  p_program_id uuid, p_invite_code text default null, p_share_nutrition boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
revoke all on function public.enroll_in_program(uuid, text, boolean) from public, anon;
grant execute on function public.enroll_in_program(uuid, text, boolean) to authenticated;

create or replace function public.clone_program_for_client(p_program_id uuid, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
revoke all on function public.clone_program_for_client(uuid, uuid) from public, anon;
grant execute on function public.clone_program_for_client(uuid, uuid) to authenticated;

-- Dedicated RPC so coaches can ONLY update coach_reply and reviewed_at on weekly_checkins.
create or replace function public.review_weekly_checkin(p_checkin_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
revoke all on function public.review_weekly_checkin(uuid, text) from public, anon;
grant execute on function public.review_weekly_checkin(uuid, text) to authenticated;

-- ============================================================================
-- 9. Strict Row Level Security Policies
-- ============================================================================

-- 9a. coach_profiles
alter table public.coach_profiles enable row level security;
revoke all on public.coach_profiles from anon;
grant select, insert, update, delete on public.coach_profiles to authenticated;

drop policy if exists "coach_profiles_select" on public.coach_profiles;
create policy "coach_profiles_select" on public.coach_profiles
  for select to authenticated using (
    is_public = true
    or user_id = (select auth.uid())
    or exists (
      select 1 from public.enrollments e
      where e.coach_id = coach_profiles.user_id
        and e.client_id = (select auth.uid())
        and e.status in ('pending', 'active', 'paused', 'completed')
    )
  );
drop policy if exists "coach_profiles_manage_own" on public.coach_profiles;
create policy "coach_profiles_manage_own" on public.coach_profiles
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_coach((select auth.uid())))
  with check (user_id = (select auth.uid()) and public.is_coach((select auth.uid())));

-- 9b. programs
alter table public.programs enable row level security;
revoke all on public.programs from anon;
grant select, insert, update, delete on public.programs to authenticated;

drop policy if exists "programs_select" on public.programs;
create policy "programs_select" on public.programs
  for select to authenticated using (public.can_read_program(id, (select auth.uid())));
drop policy if exists "programs_insert_coach" on public.programs;
create policy "programs_insert_coach" on public.programs
  for insert to authenticated with check (
    coach_id = (select auth.uid())
    and public.is_coach((select auth.uid()))
    and (assigned_client_id is null or public.is_active_coach_of(assigned_client_id, (select auth.uid())))
  );
drop policy if exists "programs_update_coach" on public.programs;
create policy "programs_update_coach" on public.programs
  for update to authenticated
  using (coach_id = (select auth.uid()) and public.is_coach((select auth.uid())))
  with check (coach_id = (select auth.uid()) and public.is_coach((select auth.uid())));
drop policy if exists "programs_delete_coach" on public.programs;
create policy "programs_delete_coach" on public.programs
  for delete to authenticated
  using (coach_id = (select auth.uid()) and public.is_coach((select auth.uid())));

-- 9c. program_workouts, program_workout_exercises, program_workout_cardio
alter table public.program_workouts enable row level security;
revoke all on public.program_workouts from anon;
grant select, insert, update, delete on public.program_workouts to authenticated;

drop policy if exists "program_workouts_select" on public.program_workouts;
create policy "program_workouts_select" on public.program_workouts
  for select to authenticated using (public.can_read_program_content(program_id, (select auth.uid())));
drop policy if exists "program_workouts_manage_coach" on public.program_workouts;
create policy "program_workouts_manage_coach" on public.program_workouts
  for all to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and p.coach_id = (select auth.uid()) and public.is_coach((select auth.uid()))))
  with check (exists (select 1 from public.programs p where p.id = program_id and p.coach_id = (select auth.uid()) and public.is_coach((select auth.uid()))));

alter table public.program_workout_exercises enable row level security;
revoke all on public.program_workout_exercises from anon;
grant select, insert, update, delete on public.program_workout_exercises to authenticated;

drop policy if exists "program_workout_exercises_select" on public.program_workout_exercises;
create policy "program_workout_exercises_select" on public.program_workout_exercises
  for select to authenticated using (
    exists (select 1 from public.program_workouts pw where pw.id = program_workout_id and public.can_read_program_content(pw.program_id, (select auth.uid())))
  );
drop policy if exists "program_workout_exercises_manage_coach" on public.program_workout_exercises;
create policy "program_workout_exercises_manage_coach" on public.program_workout_exercises
  for all to authenticated
  using (exists (
    select 1 from public.program_workouts pw join public.programs p on p.id = pw.program_id
    where pw.id = program_workout_id and p.coach_id = (select auth.uid()) and public.is_coach((select auth.uid()))
  ))
  with check (exists (
    select 1 from public.program_workouts pw join public.programs p on p.id = pw.program_id
    where pw.id = program_workout_id and p.coach_id = (select auth.uid()) and public.is_coach((select auth.uid()))
  ));

alter table public.program_workout_cardio enable row level security;
revoke all on public.program_workout_cardio from anon;
grant select, insert, update, delete on public.program_workout_cardio to authenticated;

drop policy if exists "program_workout_cardio_select" on public.program_workout_cardio;
create policy "program_workout_cardio_select" on public.program_workout_cardio
  for select to authenticated using (
    exists (select 1 from public.program_workouts pw where pw.id = program_workout_id and public.can_read_program_content(pw.program_id, (select auth.uid())))
  );
drop policy if exists "program_workout_cardio_manage_coach" on public.program_workout_cardio;
create policy "program_workout_cardio_manage_coach" on public.program_workout_cardio
  for all to authenticated
  using (exists (
    select 1 from public.program_workouts pw join public.programs p on p.id = pw.program_id
    where pw.id = program_workout_id and p.coach_id = (select auth.uid()) and public.is_coach((select auth.uid()))
  ))
  with check (exists (
    select 1 from public.program_workouts pw join public.programs p on p.id = pw.program_id
    where pw.id = program_workout_id and p.coach_id = (select auth.uid()) and public.is_coach((select auth.uid()))
  ));

-- 9d. enrollments
alter table public.enrollments enable row level security;
revoke all on public.enrollments from anon;
grant select, insert, update, delete on public.enrollments to authenticated;

drop policy if exists "enrollments_select" on public.enrollments;
create policy "enrollments_select" on public.enrollments
  for select to authenticated using (
    client_id = (select auth.uid())
    or (coach_id = (select auth.uid()) and public.is_coach((select auth.uid())))
  );
drop policy if exists "enrollments_update_coach" on public.enrollments;
create policy "enrollments_update_coach" on public.enrollments
  for update to authenticated
  using (coach_id = (select auth.uid()) and public.is_coach((select auth.uid())))
  with check (coach_id = (select auth.uid()) and public.is_coach((select auth.uid())));
drop policy if exists "enrollments_update_client" on public.enrollments;
create policy "enrollments_update_client" on public.enrollments
  for update to authenticated
  using (client_id = (select auth.uid()) and status in ('pending', 'active', 'paused'))
  with check (client_id = (select auth.uid()) and status in ('pending', 'active', 'paused', 'completed'));
-- Clients can cancel their own pending enrollment request.
drop policy if exists "enrollments_delete_pending_client" on public.enrollments;
create policy "enrollments_delete_pending_client" on public.enrollments
  for delete to authenticated
  using (client_id = (select auth.uid()) and status = 'pending');

-- 9e. coach_client_notes (strictly private to coach)
alter table public.coach_client_notes enable row level security;
revoke all on public.coach_client_notes from anon;
grant select, insert, update, delete on public.coach_client_notes to authenticated;

drop policy if exists "coach_client_notes_coach_only" on public.coach_client_notes;
create policy "coach_client_notes_coach_only" on public.coach_client_notes
  for all to authenticated
  using (coach_id = (select auth.uid()) and public.is_coach((select auth.uid())))
  with check (coach_id = (select auth.uid()) and public.is_coach((select auth.uid())));

-- 9f. workout_feedback (bidirectional mini-thread between workout owner and active coach)
alter table public.workout_feedback enable row level security;
revoke all on public.workout_feedback from anon;
grant select, insert, update, delete on public.workout_feedback to authenticated;

drop policy if exists "workout_feedback_select" on public.workout_feedback;
create policy "workout_feedback_select" on public.workout_feedback
  for select to authenticated using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_feedback.workout_id
        and (w.user_id = (select auth.uid()) or public.is_active_coach_of(w.user_id, (select auth.uid())))
    )
  );
drop policy if exists "workout_feedback_insert" on public.workout_feedback;
create policy "workout_feedback_insert" on public.workout_feedback
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.workouts w
      where w.id = workout_feedback.workout_id
        and (w.user_id = (select auth.uid()) or public.is_active_coach_of(w.user_id, (select auth.uid())))
    )
  );
drop policy if exists "workout_feedback_update_own" on public.workout_feedback;
create policy "workout_feedback_update_own" on public.workout_feedback
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
drop policy if exists "workout_feedback_delete_own" on public.workout_feedback;
create policy "workout_feedback_delete_own" on public.workout_feedback
  for delete to authenticated using (author_id = (select auth.uid()));

-- 9g. weekly_checkins (coach reviews strictly via review_weekly_checkin RPC)
alter table public.weekly_checkins enable row level security;
revoke all on public.weekly_checkins from anon;
grant select, insert, update, delete on public.weekly_checkins to authenticated;

drop policy if exists "weekly_checkins_select" on public.weekly_checkins;
create policy "weekly_checkins_select" on public.weekly_checkins
  for select to authenticated using (
    client_id = (select auth.uid())
    or (coach_id = (select auth.uid()) and public.is_active_coach_of(client_id, (select auth.uid())))
  );
drop policy if exists "weekly_checkins_insert_client" on public.weekly_checkins;
create policy "weekly_checkins_insert_client" on public.weekly_checkins
  for insert to authenticated with check (
    client_id = (select auth.uid())
    and public.is_active_coach_of(client_id, coach_id)
    and coach_reply is null
    and reviewed_at is null
  );
drop policy if exists "weekly_checkins_update_client" on public.weekly_checkins;
create policy "weekly_checkins_update_client" on public.weekly_checkins
  for update to authenticated
  using (client_id = (select auth.uid()) and reviewed_at is null)
  with check (client_id = (select auth.uid()) and coach_reply is null and reviewed_at is null);
drop policy if exists "weekly_checkins_delete_client" on public.weekly_checkins;
create policy "weekly_checkins_delete_client" on public.weekly_checkins
  for delete to authenticated using (client_id = (select auth.uid()) and reviewed_at is null);

-- 9h. notifications (inserts happen only via SECURITY DEFINER triggers/RPCs)
alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
grant select, update, delete on public.notifications to authenticated;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- 9i. Read-only coach policies on existing client tables (active clients only)
drop policy if exists "profiles_select_active_coach" on public.profiles;
create policy "profiles_select_active_coach" on public.profiles
  for select to authenticated using (public.is_active_coach_of(id, (select auth.uid())));

drop policy if exists "workouts_select_active_coach" on public.workouts;
create policy "workouts_select_active_coach" on public.workouts
  for select to authenticated using (public.is_active_coach_of(user_id, (select auth.uid())));

drop policy if exists "workout_sets_select_active_coach" on public.workout_sets;
create policy "workout_sets_select_active_coach" on public.workout_sets
  for select to authenticated using (public.is_active_coach_of(user_id, (select auth.uid())));

drop policy if exists "cardio_sessions_select_active_coach" on public.cardio_sessions;
create policy "cardio_sessions_select_active_coach" on public.cardio_sessions
  for select to authenticated using (public.is_active_coach_of(user_id, (select auth.uid())));

drop policy if exists "daily_weight_select_active_coach" on public.daily_weight;
create policy "daily_weight_select_active_coach" on public.daily_weight
  for select to authenticated using (public.is_active_coach_of(user_id, (select auth.uid())));

drop policy if exists "daily_steps_select_active_coach" on public.daily_steps;
create policy "daily_steps_select_active_coach" on public.daily_steps
  for select to authenticated using (public.is_active_coach_of(user_id, (select auth.uid())));

drop policy if exists "daily_checkin_select_active_coach" on public.daily_checkin;
create policy "daily_checkin_select_active_coach" on public.daily_checkin
  for select to authenticated using (public.is_active_coach_of(user_id, (select auth.uid())));

-- Nutrition read-only access for active coaches when client has share_nutrition = true
drop policy if exists "meals_select_active_coach" on public.meals;
create policy "meals_select_active_coach" on public.meals
  for select to authenticated using (public.is_active_coach_with_nutrition(user_id, (select auth.uid())));

drop policy if exists "meal_items_select_active_coach" on public.meal_items;
create policy "meal_items_select_active_coach" on public.meal_items
  for select to authenticated using (
    exists (
      select 1 from public.meals m
      where m.id = meal_items.meal_id
        and public.is_active_coach_with_nutrition(m.user_id, (select auth.uid()))
    )
  );

drop policy if exists "user_targets_select_active_coach" on public.user_targets;
create policy "user_targets_select_active_coach" on public.user_targets
  for select to authenticated using (public.is_active_coach_with_nutrition(user_id, (select auth.uid())));

drop policy if exists "foods_select_active_coach" on public.foods;
create policy "foods_select_active_coach" on public.foods
  for select to authenticated using (
    user_id is not null and public.is_active_coach_with_nutrition(user_id, (select auth.uid()))
  );

-- ============================================================================
-- 10. Update save_workout, sync_offline_entry (PR detection + program links)
--     and delete_my_data (GDPR)
-- ============================================================================
drop function if exists public.save_workout(text, text, date, jsonb, jsonb);

create or replace function public.save_workout(
  p_mode text,
  p_split text,
  p_date date,
  p_sets jsonb,
  p_cardio jsonb,
  p_program_workout_id uuid default null,
  p_enrollment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
revoke all on function public.save_workout(text, text, date, jsonb, jsonb, uuid, uuid) from public, anon;
grant execute on function public.save_workout(text, text, date, jsonb, jsonb, uuid, uuid) to authenticated;

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
$$;
revoke all on function public.sync_offline_entry(uuid, jsonb) from public, anon;
grant execute on function public.sync_offline_entry(uuid, jsonb) to authenticated;

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
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

commit;
