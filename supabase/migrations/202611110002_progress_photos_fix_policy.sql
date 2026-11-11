begin;

-- Fixes 202611110001: the insert policy counted public.progress_photos inside a policy of the same table, which
-- fails with "infinite recursion detected in policy". The 200-photo cap moves to a trigger.
drop policy if exists "progress_photos_insert_own" on public.progress_photos;
create policy "progress_photos_insert_own" on public.progress_photos
  for insert to authenticated with check (user_id = (select auth.uid()));

create or replace function public.progress_photos_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.progress_photos where user_id = new.user_id) >= 200 then
    raise exception 'Photo limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists progress_photos_limit on public.progress_photos;
create trigger progress_photos_limit before insert on public.progress_photos
  for each row execute function public.progress_photos_limit();

commit;
