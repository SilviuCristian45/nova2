begin;

-- Allow numbered/custom meals ('Meal') in coach meal plans (e.g. Meal 1..Meal 6+)
-- alongside classic Breakfast/Lunch/Dinner/Snack labels.
alter table public.meal_plan_meals
  drop constraint if exists meal_plan_meals_meal_type_check,
  add constraint meal_plan_meals_meal_type_check
    check (meal_type in ('Breakfast', 'Lunch', 'Dinner', 'Snack', 'Meal'));

commit;
