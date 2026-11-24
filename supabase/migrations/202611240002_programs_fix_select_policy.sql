begin;

-- Fixes 202611240001: programs_select called can_read_program(id, auth.uid()), which selects from
-- public.programs by id. During INSERT ... RETURNING (used by PostgREST .insert().select()),
-- PostgreSQL evaluates SELECT RLS policies before the new tuple is visible in public.programs,
-- causing "new row violates row-level security policy for table programs".
-- Checking the row columns directly avoids the self-lookup and allows index scans, without
-- causing RLS recursion (enrollments_select does not reference public.programs).
drop policy if exists "programs_select" on public.programs;
create policy "programs_select" on public.programs
  for select to authenticated using (
    coach_id = (select auth.uid())
    or (status = 'published' and access_type = 'public' and assigned_client_id is null)
    or exists (
      select 1 from public.enrollments e
      where e.program_id = programs.id
        and e.client_id = (select auth.uid())
        and e.status in ('pending', 'active', 'paused', 'completed')
    )
  );

commit;
