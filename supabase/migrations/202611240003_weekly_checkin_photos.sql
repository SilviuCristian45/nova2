begin;

-- Optional progress photos attached to weekly check-ins (front, back, side).
-- Stored in private Storage bucket "checkin-photos" at <client_id>/<uuid>.jpg.
-- Only the client and the active coach who received that check-in can read them.
alter table public.weekly_checkins
  add column if not exists photo_front_path text,
  add column if not exists photo_back_path text,
  add column if not exists photo_side_path text;

alter table public.weekly_checkins
  drop constraint if exists weekly_checkins_photo_front_path_check,
  add constraint weekly_checkins_photo_front_path_check
    check (
      photo_front_path is null
      or photo_front_path ~ ('^' || client_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
    ),
  drop constraint if exists weekly_checkins_photo_back_path_check,
  add constraint weekly_checkins_photo_back_path_check
    check (
      photo_back_path is null
      or photo_back_path ~ ('^' || client_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
    ),
  drop constraint if exists weekly_checkins_photo_side_path_check,
  add constraint weekly_checkins_photo_side_path_check
    check (
      photo_side_path is null
      or photo_side_path ~ ('^' || client_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
    );

create index if not exists weekly_checkins_photo_front_idx
  on public.weekly_checkins (photo_front_path) where photo_front_path is not null;
create index if not exists weekly_checkins_photo_back_idx
  on public.weekly_checkins (photo_back_path) where photo_back_path is not null;
create index if not exists weekly_checkins_photo_side_idx
  on public.weekly_checkins (photo_side_path) where photo_side_path is not null;

-- SECURITY DEFINER helper used by storage.objects RLS so coaches can only read
-- photos explicitly attached to a weekly check-in addressed to them by an active client.
create or replace function public.can_read_checkin_photo(p_path text, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.weekly_checkins wc
    where (
      wc.photo_front_path = p_path
      or wc.photo_back_path = p_path
      or wc.photo_side_path = p_path
    )
    and (
      wc.client_id = p_uid
      or (wc.coach_id = p_uid and public.is_active_coach_of(wc.client_id, p_uid))
    )
  );
$$;
revoke all on function public.can_read_checkin_photo(text, uuid) from public, anon;
grant execute on function public.can_read_checkin_photo(text, uuid) to authenticated;

-- Private bucket, JPEG only, 5 MB per file (the app resizes to at most 1600 px before uploading).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkin-photos', 'checkin-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists "checkin_photos_objects_select" on storage.objects;
create policy "checkin_photos_objects_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'checkin-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.can_read_checkin_photo(name, (select auth.uid()))
    )
  );

drop policy if exists "checkin_photos_objects_insert" on storage.objects;
create policy "checkin_photos_objects_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'checkin-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "checkin_photos_objects_delete" on storage.objects;
create policy "checkin_photos_objects_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'checkin-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
