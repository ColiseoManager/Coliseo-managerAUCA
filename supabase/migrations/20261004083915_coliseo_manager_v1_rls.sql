
alter table public.daily_closings enable row level security;
alter table public.events enable row level security;
alter table public.reservations enable row level security;
alter table public.expenses enable row level security;
alter table public.inventory_items enable row level security;
alter table public.tasks enable row level security;
create policy auth_daily on public.daily_closings for all to authenticated using (true) with check (true);
create policy auth_events on public.events for all to authenticated using (true) with check (true);
create policy auth_reservations on public.reservations for all to authenticated using (true) with check (true);
create policy auth_expenses on public.expenses for all to authenticated using (true) with check (true);
create policy auth_inventory on public.inventory_items for all to authenticated using (true) with check (true);
create policy auth_tasks on public.tasks for all to authenticated using (true) with check (true);
