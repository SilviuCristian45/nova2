begin;

-- Every table that stores a user's rows must disappear with the auth user (GDPR erasure).
alter table public.profiles drop constraint profiles_id_fkey,
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
alter table public.daily_steps drop constraint daily_steps_user_id_fkey,
  add constraint daily_steps_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.meals drop constraint meals_user_id_fkey,
  add constraint meals_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.user_targets drop constraint user_targets_user_id_fkey,
  add constraint user_targets_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- Barcode products are public Open Food Facts data: they live in the shared catalog (user_id null),
-- so everyone can scan every barcode. Only foods typed in by a user stay private and are erased with them.
update public.foods set user_id = null where barcode is not null;
alter table public.foods drop constraint foods_user_id_fkey,
  add constraint foods_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
-- A meal item cannot outlive its food. Without this, erasing a user's custom foods could be blocked
-- depending on the order Postgres runs the cascades from auth.users.
alter table public.meal_items drop constraint meal_items_food_id_fkey,
  add constraint meal_items_food_id_fkey foreign key (food_id) references public.foods(id) on delete cascade;

-- Meal items may only point at foods the user can see (shared catalog or their own).
drop policy "Utilizatorii își pot gestiona elementele meselor." on public.meal_items;
create policy "Utilizatorii își pot gestiona elementele meselor." on public.meal_items
  using ((select auth.uid()) in (select m.user_id from public.meals m where m.id = meal_items.meal_id))
  with check (
    (select auth.uid()) in (select m.user_id from public.meals m where m.id = meal_items.meal_id)
    and exists (select 1 from public.foods f where f.id = meal_items.food_id
      and (f.user_id is null or f.user_id = (select auth.uid())))
  );

-- Personal details edited on the settings page.
alter table public.profiles
  add column display_name text check (char_length(display_name) between 1 and 80),
  add column height_cm numeric(4, 1) check (height_cm between 50 and 272),
  add column birth_date date check (birth_date >= date '1900-01-01'),
  add column sex text check (sex in ('male', 'female')),
  add column weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb'));

create or replace function public.handle_new_user()
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

-- "Delete all my data": wipes every logged row but keeps the account and its profile settings.
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
  delete from public.offline_sync_receipts where user_id = owner;
end;
$$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

commit;
