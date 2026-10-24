begin;

-- Inputs for the calorie recommendation on /meals/progress/targets.
alter table public.profiles
  add column activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  add column goal_kg_per_week numeric(3, 2) not null default 0 check (goal_kg_per_week between -1 and 1);

commit;
