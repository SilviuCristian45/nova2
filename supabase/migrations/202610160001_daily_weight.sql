begin;

create table if not exists public.daily_weight (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric(6, 2) not null check (weight_kg > 0 and weight_kg < 10000),
  primary key (user_id, date)
);

alter table public.daily_weight enable row level security;
revoke all on public.daily_weight from anon;
grant select, insert, update, delete on public.daily_weight to authenticated;

create policy "Users can read their own weight"
  on public.daily_weight for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own weight"
  on public.daily_weight for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own weight"
  on public.daily_weight for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own weight"
  on public.daily_weight for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
