
alter table public.inventory_items
  add column if not exists serving_size numeric(14,4),
  add column if not exists serving_unit text;

update public.inventory_items
set serving_size = 45, serving_unit = 'ml'
where display_unit = 'botella' and serving_size is null;
