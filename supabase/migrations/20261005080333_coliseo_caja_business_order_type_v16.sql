
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','staff','cashier'));

alter table public.menu_items add column if not exists business text;
alter table public.menu_items drop constraint if exists menu_items_business_check;
alter table public.menu_items add constraint menu_items_business_check check (business is null or business in ('Cuervos Pizza','EL CLúB'));

alter table public.orders add column if not exists order_type text not null default 'table';
alter table public.orders add column if not exists delivery_platform text;
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders add constraint orders_order_type_check check (order_type in ('table','takeaway','delivery'));
alter table public.orders drop constraint if exists orders_delivery_platform_check;
alter table public.orders add constraint orders_delivery_platform_check check (delivery_platform is null or delivery_platform in ('Uber Eats','DiDi Food','Otra'));

alter table public.order_items add column if not exists business text;
alter table public.order_items drop constraint if exists order_items_business_check;
alter table public.order_items add constraint order_items_business_check check (business is null or business in ('Cuervos Pizza','EL CLúB'));

create or replace function public.is_cashier()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='cashier' and active=true);
$$;
grant execute on function public.is_cashier() to authenticated;

drop policy if exists "orders select own admin" on public.orders;
create policy "orders select own admin cashier" on public.orders for select to authenticated
using (public.is_admin() or public.is_cashier() or created_by=auth.uid() or assigned_to=auth.uid());

drop policy if exists "orders insert own" on public.orders;
create policy "orders insert own cashier" on public.orders for insert to authenticated
with check (created_by=auth.uid() and (assigned_to is null or assigned_to=auth.uid() or public.is_cashier()));

drop policy if exists "orders admin update" on public.orders;
create policy "orders admin cashier update" on public.orders for update to authenticated
using (public.is_admin() or public.is_cashier())
with check (public.is_admin() or public.is_cashier());

drop policy if exists "items select own admin" on public.order_items;
create policy "items select own admin cashier" on public.order_items for select to authenticated
using (public.is_admin() or public.is_cashier() or exists(select 1 from public.orders o where o.id=order_id and (o.created_by=auth.uid() or o.assigned_to=auth.uid())));

drop policy if exists "items insert own" on public.order_items;
create policy "items insert own cashier" on public.order_items for insert to authenticated
with check (public.is_admin() or public.is_cashier() or exists(select 1 from public.orders o where o.id=order_id and (o.created_by=auth.uid() or o.assigned_to=auth.uid())));

create or replace function public.recalc_order_total(p_order uuid)
returns void language sql security definer set search_path=public as $$
 update public.orders o set total=coalesce((select sum(oi.unit_price*oi.quantity) from public.order_items oi where oi.order_id=p_order),0),updated_at=now()
 where o.id=p_order and (public.is_admin() or public.is_cashier() or o.created_by=auth.uid() or o.assigned_to=auth.uid());
$$;
grant execute on function public.recalc_order_total(uuid) to authenticated;
