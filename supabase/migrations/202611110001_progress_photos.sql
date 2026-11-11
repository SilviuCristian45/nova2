begin;

-- Progress photos: the images live in the private Storage bucket "progress-photos" (path <user_id>/<id>.jpg),
-- the metadata in public.progress_photos. Both are only readable and writable by the owner.
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  taken_on date not null,
  pose text not null default 'front' check (pose in ('front', 'side', 'back', 'other')),
  note text check (note is null or char_length(note) <= 280),
  path text not null unique,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now(),
  check (path = user_id::text || '/' || id::text || '.jpg')
);

create index if not exists progress_photos_user_date_idx on public.progress_photos (user_id, taken_on desc);

alter table public.progress_photos enable row level security;

drop policy if exists "progress_photos_select_own" on public.progress_photos;
create policy "progress_photos_select_own" on public.progress_photos
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "progress_photos_insert_own" on public.progress_photos;
create policy "progress_photos_insert_own" on public.progress_photos
  for insert to authenticated with check (user_id = (select auth.uid()));

-- At most 200 photos per account. A trigger, not a policy: a policy that counts the table it protects
-- fails with "infinite recursion detected in policy".
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

drop policy if exists "progress_photos_delete_own" on public.progress_photos;
create policy "progress_photos_delete_own" on public.progress_photos
  for delete to authenticated using (user_id = (select auth.uid()));

-- Private bucket, JPEG only, 5 MB per file (the app resizes to at most 1600 px before uploading).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists "progress_photos_objects_select" on storage.objects;
create policy "progress_photos_objects_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "progress_photos_objects_insert" on storage.objects;
create policy "progress_photos_objects_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "progress_photos_objects_delete" on storage.objects;
create policy "progress_photos_objects_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- delete_my_data drops the rows; the app removes the image files through the Storage API first
-- (Supabase does not allow deleting from storage.objects with SQL).
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
  delete from public.daily_checkin where user_id = owner;
  delete from public.progress_photos where user_id = owner;
  delete from public.offline_sync_receipts where user_id = owner;
  delete from public.google_drive_backups where user_id = owner;
end;
$$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

commit;
