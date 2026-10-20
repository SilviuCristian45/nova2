begin;

create table public.workout_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) <= 1000000),
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.workout_drafts enable row level security;
revoke all on public.workout_drafts from public, anon, authenticated;
grant select on public.workout_drafts to authenticated;

create policy "Users can read their workout draft"
  on public.workout_drafts for select to authenticated
  using ((select auth.uid()) = user_id);

-- Writes use this function so an older edit from another device cannot overwrite a newer draft.
create or replace function public.save_workout_draft(p_draft jsonb, p_client_updated_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.save_workout_draft(jsonb, timestamptz) from public, anon;
grant execute on function public.save_workout_draft(jsonb, timestamptz) to authenticated;

commit;
