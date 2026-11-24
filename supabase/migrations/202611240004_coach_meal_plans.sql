begin;

-- ============================================================================
-- Coach Meal Plans: reusable templates & client-assigned nutrition plans,
-- days, meals, items, revocable public share links, notifications, and RLS.
-- ============================================================================

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  assigned_client_id uuid references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  goal text not null default 'maintenance'
    check (goal in ('fat_loss', 'maintenance', 'muscle_gain', 'recomp', 'performance')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  target_kcal integer check (target_kcal is null or target_kcal between 500 and 15000),
  target_protein_g integer check (target_protein_g is null or target_protein_g between 0 and 1000),
  target_carbs_g integer check (target_carbs_g is null or target_carbs_g between 0 and 2000),
  target_fat_g integer check (target_fat_g is null or target_fat_g between 0 and 500),
  target_fiber_g integer check (target_fiber_g is null or target_fiber_g between 0 and 200),
  water_liters numeric(3, 1) check (water_liters is null or water_liters between 0.5 and 15.0),
  notes text check (notes is null or char_length(notes) <= 3000),
  share_token text unique check (share_token is null or share_token ~ '^[A-Za-z0-9_-]{16,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (assigned_client_id is null or assigned_client_id <> coach_id)
);

create index if not exists meal_plans_coach_idx
  on public.meal_plans (coach_id, status, updated_at desc);
create index if not exists meal_plans_client_active_idx
  on public.meal_plans (assigned_client_id, status, updated_at desc)
  where assigned_client_id is not null;

create table if not exists public.meal_plan_days (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  position integer not null check (position >= 1),
  title text not null check (char_length(trim(title)) between 1 and 80),
  notes text check (notes is null or char_length(notes) <= 1000)
);

create index if not exists meal_plan_days_plan_idx
  on public.meal_plan_days (meal_plan_id, position);

create table if not exists public.meal_plan_meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_day_id uuid not null references public.meal_plan_days(id) on delete cascade,
  position integer not null check (position >= 1),
  meal_type text not null default 'Breakfast'
    check (meal_type in ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  time_label text check (time_label is null or char_length(trim(time_label)) <= 30),
  notes text check (notes is null or char_length(notes) <= 1000)
);

create index if not exists meal_plan_meals_day_idx
  on public.meal_plan_meals (meal_plan_day_id, position);

create table if not exists public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_plan_meal_id uuid not null references public.meal_plan_meals(id) on delete cascade,
  position integer not null check (position >= 1),
  food_id uuid references public.foods(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 200),
  brand text check (brand is null or char_length(brand) <= 120),
  grams numeric(7, 1) not null check (grams > 0 and grams <= 10000),
  kcal_per_100g numeric(7, 2) not null default 0 check (kcal_per_100g >= 0 and kcal_per_100g <= 10000),
  protein_per_100g numeric(7, 2) not null default 0 check (protein_per_100g >= 0 and protein_per_100g <= 1000),
  carbs_per_100g numeric(7, 2) not null default 0 check (carbs_per_100g >= 0 and carbs_per_100g <= 1000),
  fat_per_100g numeric(7, 2) not null default 0 check (fat_per_100g >= 0 and fat_per_100g <= 1000),
  fiber_per_100g numeric(7, 2) check (fiber_per_100g is null or (fiber_per_100g >= 0 and fiber_per_100g <= 1000)),
  notes text check (notes is null or char_length(notes) <= 280)
);

create index if not exists meal_plan_items_meal_idx
  on public.meal_plan_items (meal_plan_meal_id, position);

-- ============================================================================
-- Notifications: extend allowed types for meal plans
-- ============================================================================
alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check check (type in (
    'enroll_requested', 'enroll_approved', 'enroll_rejected',
    'program_assigned', 'workout_feedback',
    'weekly_checkin_submitted', 'weekly_checkin_reviewed', 'client_pr',
    'meal_plan_assigned', 'meal_plan_updated'
  ));

-- ============================================================================
-- SECURITY DEFINER helpers for RLS (prevent recursion)
-- ============================================================================
create or replace function public.is_meal_plan_owner(p_plan_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.meal_plans mp
    where mp.id = p_plan_id
      and mp.coach_id = p_uid
      and public.is_coach(p_uid)
  );
$$;
revoke all on function public.is_meal_plan_owner(uuid, uuid) from public, anon;
grant execute on function public.is_meal_plan_owner(uuid, uuid) to authenticated;

create or replace function public.can_read_meal_plan(p_plan_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.meal_plans mp
    where mp.id = p_plan_id
      and (
        mp.coach_id = p_uid
        or (
          mp.assigned_client_id = p_uid
          and mp.status = 'active'
          and exists (
            select 1
            from public.enrollments e
            where e.coach_id = mp.coach_id
              and e.client_id = p_uid
              and e.status in ('active', 'completed')
          )
        )
      )
  );
$$;
revoke all on function public.can_read_meal_plan(uuid, uuid) from public, anon;
grant execute on function public.can_read_meal_plan(uuid, uuid) to authenticated;

-- ============================================================================
-- Notification triggers & RPCs
-- ============================================================================
create or replace function public.notify_on_meal_plan_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  coach_name text;
begin
  if new.assigned_client_id is null or new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'INSERT'
    or old.assigned_client_id is distinct from new.assigned_client_id
    or old.status is distinct from new.status
  then
    select coalesce(cp.display_name, pr.display_name, '')
    into coach_name
    from public.profiles pr
    left join public.coach_profiles cp on cp.user_id = pr.id
    where pr.id = new.coach_id;

    perform public.create_notification(
      new.assigned_client_id,
      new.coach_id,
      'meal_plan_assigned',
      jsonb_build_object(
        'meal_plan_id', new.id,
        'plan_title', new.title,
        'coach_name', coalesce(coach_name, '')
      ),
      '/meals/plan'
    );
  end if;
  return new;
end;
$$;
revoke all on function public.notify_on_meal_plan_assigned() from public, anon, authenticated;

drop trigger if exists notify_on_meal_plan_assigned on public.meal_plans;
create trigger notify_on_meal_plan_assigned
  after insert or update of status, assigned_client_id on public.meal_plans
  for each row execute function public.notify_on_meal_plan_assigned();

create or replace function public.notify_meal_plan_updated(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  coach uuid := auth.uid();
  plan_row public.meal_plans%rowtype;
  coach_name text;
begin
  if coach is null or not public.is_coach(coach) then
    raise exception 'Coach access required' using errcode = 'insufficient_privilege';
  end if;

  select * into plan_row
  from public.meal_plans
  where id = p_plan_id and coach_id = coach;

  if not found or plan_row.assigned_client_id is null or plan_row.status <> 'active' then
    return;
  end if;

  select coalesce(cp.display_name, pr.display_name, '')
  into coach_name
  from public.profiles pr
  left join public.coach_profiles cp on cp.user_id = pr.id
  where pr.id = coach;

  perform public.create_notification(
    plan_row.assigned_client_id,
    coach,
    'meal_plan_updated',
    jsonb_build_object(
      'meal_plan_id', plan_row.id,
      'plan_title', plan_row.title,
      'coach_name', coalesce(coach_name, '')
    ),
    '/meals/plan'
  );
end;
$$;
revoke all on function public.notify_meal_plan_updated(uuid) from public, anon;
grant execute on function public.notify_meal_plan_updated(uuid) to authenticated;

-- Clone a template (or existing plan) into an active personalized meal plan for an active client.
create or replace function public.clone_meal_plan_for_client(p_plan_id uuid, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  coach uuid := auth.uid();
  src public.meal_plans%rowtype;
  new_plan_id uuid;
  d_row public.meal_plan_days%rowtype;
  new_day_id uuid;
  m_row public.meal_plan_meals%rowtype;
  new_meal_id uuid;
begin
  if coach is null or not public.is_coach(coach) then
    raise exception 'Coach access required' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_active_coach_of(p_client_id, coach) then
    raise exception 'Client is not active under this coach' using errcode = 'insufficient_privilege';
  end if;

  select * into src
  from public.meal_plans
  where id = p_plan_id and coach_id = coach;
  if not found then
    raise exception 'Meal plan not found';
  end if;

  insert into public.meal_plans (
    coach_id, assigned_client_id, title, description, goal, status,
    target_kcal, target_protein_g, target_carbs_g, target_fat_g, target_fiber_g,
    water_liters, notes, share_token
  ) values (
    coach, p_client_id, src.title, src.description, src.goal, 'active',
    src.target_kcal, src.target_protein_g, src.target_carbs_g, src.target_fat_g, src.target_fiber_g,
    src.water_liters, src.notes, null
  ) returning id into new_plan_id;

  for d_row in
    select * from public.meal_plan_days where meal_plan_id = src.id order by position
  loop
    insert into public.meal_plan_days (meal_plan_id, position, title, notes)
    values (new_plan_id, d_row.position, d_row.title, d_row.notes)
    returning id into new_day_id;

    for m_row in
      select * from public.meal_plan_meals where meal_plan_day_id = d_row.id order by position
    loop
      insert into public.meal_plan_meals (meal_plan_day_id, position, meal_type, title, time_label, notes)
      values (new_day_id, m_row.position, m_row.meal_type, m_row.title, m_row.time_label, m_row.notes)
      returning id into new_meal_id;

      insert into public.meal_plan_items (
        meal_plan_meal_id, position, food_id, name, brand, grams,
        kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, notes
      )
      select
        new_meal_id, position, food_id, name, brand, grams,
        kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, notes
      from public.meal_plan_items
      where meal_plan_meal_id = m_row.id
      order by position;
    end loop;
  end loop;

  return new_plan_id;
end;
$$;
revoke all on function public.clone_meal_plan_for_client(uuid, uuid) from public, anon;
grant execute on function public.clone_meal_plan_for_client(uuid, uuid) to authenticated;

-- Public read-only RPC for shared meal plan links (/plan/[token]).
-- Never exposes coach_id, assigned_client_id, or any private client data.
create or replace function public.get_shared_meal_plan(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  plan_row public.meal_plans%rowtype;
  coach_name text;
  days_json jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    return null;
  end if;

  select * into plan_row
  from public.meal_plans
  where share_token = p_token
    and status <> 'archived'
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(nullif(trim(cp.display_name), ''), nullif(trim(pr.display_name), ''), 'Coach')
  into coach_name
  from public.profiles pr
  left join public.coach_profiles cp on cp.user_id = pr.id
  where pr.id = plan_row.coach_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'position', d.position,
      'title', d.title,
      'notes', d.notes,
      'meals', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'position', m.position,
            'meal_type', m.meal_type,
            'title', m.title,
            'time_label', m.time_label,
            'notes', m.notes,
            'items', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', i.id,
                  'position', i.position,
                  'name', i.name,
                  'brand', i.brand,
                  'grams', i.grams,
                  'kcal_per_100g', i.kcal_per_100g,
                  'protein_per_100g', i.protein_per_100g,
                  'carbs_per_100g', i.carbs_per_100g,
                  'fat_per_100g', i.fat_per_100g,
                  'fiber_per_100g', i.fiber_per_100g,
                  'notes', i.notes
                ) order by i.position
              )
              from public.meal_plan_items i
              where i.meal_plan_meal_id = m.id
            ), '[]'::jsonb)
          ) order by m.position
        )
        from public.meal_plan_meals m
        where m.meal_plan_day_id = d.id
      ), '[]'::jsonb)
    ) order by d.position
  ), '[]'::jsonb)
  into days_json
  from public.meal_plan_days d
  where d.meal_plan_id = plan_row.id;

  return jsonb_build_object(
    'id', plan_row.id,
    'title', plan_row.title,
    'description', plan_row.description,
    'goal', plan_row.goal,
    'status', plan_row.status,
    'target_kcal', plan_row.target_kcal,
    'target_protein_g', plan_row.target_protein_g,
    'target_carbs_g', plan_row.target_carbs_g,
    'target_fat_g', plan_row.target_fat_g,
    'target_fiber_g', plan_row.target_fiber_g,
    'water_liters', plan_row.water_liters,
    'notes', plan_row.notes,
    'coach_name', coalesce(coach_name, 'Coach'),
    'updated_at', plan_row.updated_at,
    'days', days_json
  );
end;
$$;
revoke all on function public.get_shared_meal_plan(text) from public;
grant execute on function public.get_shared_meal_plan(text) to anon, authenticated;

-- ============================================================================
-- Row Level Security Policies
-- ============================================================================

-- meal_plans
alter table public.meal_plans enable row level security;
revoke all on public.meal_plans from anon;
grant select, insert, update, delete on public.meal_plans to authenticated;

drop policy if exists "meal_plans_select" on public.meal_plans;
create policy "meal_plans_select" on public.meal_plans
  for select to authenticated using (
    public.can_read_meal_plan(id, (select auth.uid()))
  );

drop policy if exists "meal_plans_insert" on public.meal_plans;
create policy "meal_plans_insert" on public.meal_plans
  for insert to authenticated with check (
    coach_id = (select auth.uid())
    and public.is_coach((select auth.uid()))
    and (
      assigned_client_id is null
      or public.is_active_coach_of(assigned_client_id, (select auth.uid()))
    )
  );

drop policy if exists "meal_plans_update" on public.meal_plans;
create policy "meal_plans_update" on public.meal_plans
  for update to authenticated
  using (
    coach_id = (select auth.uid())
    and public.is_coach((select auth.uid()))
  )
  with check (
    coach_id = (select auth.uid())
    and public.is_coach((select auth.uid()))
    and (
      assigned_client_id is null
      or public.is_active_coach_of(assigned_client_id, (select auth.uid()))
    )
  );

drop policy if exists "meal_plans_delete" on public.meal_plans;
create policy "meal_plans_delete" on public.meal_plans
  for delete to authenticated using (
    coach_id = (select auth.uid())
    and public.is_coach((select auth.uid()))
  );

-- meal_plan_days
alter table public.meal_plan_days enable row level security;
revoke all on public.meal_plan_days from anon;
grant select, insert, update, delete on public.meal_plan_days to authenticated;

drop policy if exists "meal_plan_days_select" on public.meal_plan_days;
create policy "meal_plan_days_select" on public.meal_plan_days
  for select to authenticated using (
    public.can_read_meal_plan(meal_plan_id, (select auth.uid()))
  );

drop policy if exists "meal_plan_days_insert" on public.meal_plan_days;
create policy "meal_plan_days_insert" on public.meal_plan_days
  for insert to authenticated with check (
    public.is_meal_plan_owner(meal_plan_id, (select auth.uid()))
  );

drop policy if exists "meal_plan_days_update" on public.meal_plan_days;
create policy "meal_plan_days_update" on public.meal_plan_days
  for update to authenticated
  using (public.is_meal_plan_owner(meal_plan_id, (select auth.uid())))
  with check (public.is_meal_plan_owner(meal_plan_id, (select auth.uid())));

drop policy if exists "meal_plan_days_delete" on public.meal_plan_days;
create policy "meal_plan_days_delete" on public.meal_plan_days
  for delete to authenticated using (
    public.is_meal_plan_owner(meal_plan_id, (select auth.uid()))
  );

-- meal_plan_meals
alter table public.meal_plan_meals enable row level security;
revoke all on public.meal_plan_meals from anon;
grant select, insert, update, delete on public.meal_plan_meals to authenticated;

drop policy if exists "meal_plan_meals_select" on public.meal_plan_meals;
create policy "meal_plan_meals_select" on public.meal_plan_meals
  for select to authenticated using (
    exists (
      select 1 from public.meal_plan_days d
      where d.id = meal_plan_day_id
        and public.can_read_meal_plan(d.meal_plan_id, (select auth.uid()))
    )
  );

drop policy if exists "meal_plan_meals_insert" on public.meal_plan_meals;
create policy "meal_plan_meals_insert" on public.meal_plan_meals
  for insert to authenticated with check (
    exists (
      select 1 from public.meal_plan_days d
      where d.id = meal_plan_day_id
        and public.is_meal_plan_owner(d.meal_plan_id, (select auth.uid()))
    )
  );

drop policy if exists "meal_plan_meals_update" on public.meal_plan_meals;
create policy "meal_plan_meals_update" on public.meal_plan_meals
  for update to authenticated
  using (
    exists (
      select 1 from public.meal_plan_days d
      where d.id = meal_plan_day_id
        and public.is_meal_plan_owner(d.meal_plan_id, (select auth.uid()))
    )
  )
  with check (
    exists (
      select 1 from public.meal_plan_days d
      where d.id = meal_plan_day_id
        and public.is_meal_plan_owner(d.meal_plan_id, (select auth.uid()))
    )
  );

drop policy if exists "meal_plan_meals_delete" on public.meal_plan_meals;
create policy "meal_plan_meals_delete" on public.meal_plan_meals
  for delete to authenticated using (
    exists (
      select 1 from public.meal_plan_days d
      where d.id = meal_plan_day_id
        and public.is_meal_plan_owner(d.meal_plan_id, (select auth.uid()))
    )
  );

-- meal_plan_items
alter table public.meal_plan_items enable row level security;
revoke all on public.meal_plan_items from anon;
grant select, insert, update, delete on public.meal_plan_items to authenticated;

drop policy if exists "meal_plan_items_select" on public.meal_plan_items;
create policy "meal_plan_items_select" on public.meal_plan_items
  for select to authenticated using (
    exists (
      select 1
      from public.meal_plan_meals m
      join public.meal_plan_days d on d.id = m.meal_plan_day_id
      where m.id = meal_plan_meal_id
        and public.can_read_meal_plan(d.meal_plan_id, (select auth.uid()))
    )
  );

drop policy if exists "meal_plan_items_insert" on public.meal_plan_items;
create policy "meal_plan_items_insert" on public.meal_plan_items
  for insert to authenticated with check (
    exists (
      select 1
      from public.meal_plan_meals m
      join public.meal_plan_days d on d.id = m.meal_plan_day_id
      where m.id = meal_plan_meal_id
        and public.is_meal_plan_owner(d.meal_plan_id, (select auth.uid()))
    )
  );

drop policy if exists "meal_plan_items_update" on public.meal_plan_items;
create policy "meal_plan_items_update" on public.meal_plan_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.meal_plan_meals m
      join public.meal_plan_days d on d.id = m.meal_plan_day_id
      where m.id = meal_plan_meal_id
        and public.is_meal_plan_owner(d.meal_plan_id, (select auth.uid()))
    )
  )
  with check (
    exists (
      select 1
      from public.meal_plan_meals m
      join public.meal_plan_days d on d.id = m.meal_plan_day_id
      where m.id = meal_plan_meal_id
        and public.is_meal_plan_owner(d.meal_plan_id, (select auth.uid()))
    )
  );

drop policy if exists "meal_plan_items_delete" on public.meal_plan_items;
create policy "meal_plan_items_delete" on public.meal_plan_items
  for delete to authenticated using (
    exists (
      select 1
      from public.meal_plan_meals m
      join public.meal_plan_days d on d.id = m.meal_plan_day_id
      where m.id = meal_plan_meal_id
        and public.is_meal_plan_owner(d.meal_plan_id, (select auth.uid()))
    )
  );

-- ============================================================================
-- GDPR: include meal_plans in delete_my_data()
-- ============================================================================
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
  delete from public.meal_plans where coach_id = owner;
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
