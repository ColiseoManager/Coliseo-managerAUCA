
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(),
 business_date date not null default current_date,
 table_number text not null,
 status text not null default 'open' check (status in ('open','closed')),
 payment_method text,
 notes text,
 total numeric(12,2) not null default 0 check (total >= 0),
 created_by uuid not null default auth.uid() references auth.users(id),
 assigned_to uuid references auth.users(id),
 opened_at timestamptz not null default now(),
 closed_at timestamptz,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 menu_item_id uuid references public.menu_items(id) on delete set null,
 item_name text not null,
 unit_price numeric(12,2) not null check(unit_price >= 0),
 quantity integer not null default 1 check(quantity > 0),
 line_total numeric(12,2) not null default 0 check(line_total >= 0),
 created_at timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_assigned_idx on public.orders(assigned_to);
create index if not exists order_items_order_idx on public.order_items(order_id);
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
drop policy if exists "orders select own admin" on public.orders;
create policy "orders select own admin" on public.orders for select to authenticated using (public.is_admin() or created_by=auth.uid() or assigned_to=auth.uid());
drop policy if exists "orders insert own" on public.orders;
create policy "orders insert own" on public.orders for insert to authenticated with check (created_by=auth.uid() and (assigned_to is null or assigned_to=auth.uid()));
drop policy if exists "orders admin update" on public.orders;
create policy "orders admin update" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "orders admin delete" on public.orders;
create policy "orders admin delete" on public.orders for delete to authenticated using (public.is_admin());
drop policy if exists "items select own admin" on public.order_items;
create policy "items select own admin" on public.order_items for select to authenticated using (
 public.is_admin() or exists(select 1 from public.orders o where o.id=order_id and (o.created_by=auth.uid() or o.assigned_to=auth.uid()))
);
drop policy if exists "items insert own" on public.order_items;
create policy "items insert own" on public.order_items for insert to authenticated with check (
 exists(select 1 from public.orders o where o.id=order_id and (o.created_by=auth.uid() or o.assigned_to=auth.uid()))
);
drop policy if exists "items admin update" on public.order_items;
create policy "items admin update" on public.order_items for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "items admin delete" on public.order_items;
create policy "items admin delete" on public.order_items for delete to authenticated using (public.is_admin());
create or replace function public.recalc_order_total(p_order uuid)
returns void language sql security definer set search_path=public as $$
 update public.orders o set total=coalesce((select sum(oi.unit_price*oi.quantity) from public.order_items oi where oi.order_id=p_order),0),updated_at=now()
 where o.id=p_order and (public.is_admin() or o.created_by=auth.uid() or o.assigned_to=auth.uid());
$$;
grant execute on function public.recalc_order_total(uuid) to authenticated;
