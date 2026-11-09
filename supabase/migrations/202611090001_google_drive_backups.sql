begin;

-- Link between an account and its Google Drive (drive.appdata scope) for automatic backups.
-- The refresh token is encrypted by the app (AES-GCM, key in DRIVE_TOKEN_KEY) and must never reach the
-- browser: RLS is on with no policies, and only the service-role client (lib/supabase/admin.ts) reads or
-- writes this table. The settings page gets email / frequency / last backup through a server route.
create table public.google_drive_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  refresh_token text not null,
  frequency text not null default 'off' check (frequency in ('off', 'daily', 'weekly', 'monthly')),
  last_backup_at timestamptz,
  last_error text check (char_length(last_error) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.google_drive_backups enable row level security;
revoke all on public.google_drive_backups from public, anon, authenticated;

-- The hourly cron only looks at enabled links.
create index google_drive_backups_enabled_idx on public.google_drive_backups (frequency) where frequency <> 'off';

-- "Delete all my data" also drops the Drive link (the app revokes the Google token before calling this).
-- import_my_data needs no change: it ignores the google_drive_backup section of an export, and a Drive link
-- is never imported.
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
  delete from public.google_drive_backups where user_id = owner;
end;
$$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

commit;
