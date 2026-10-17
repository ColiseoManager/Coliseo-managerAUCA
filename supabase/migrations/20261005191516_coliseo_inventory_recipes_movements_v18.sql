
alter table public.inventory_items
  add column if not exists base_unit text not null default 'pieza',
  add column if not exists display_unit text,
  add column if not exists quantity_per_display_unit numeric(14,4) not null default 1,
  add column if not exists manual_unavailable boolean not null default false;
alter table public.menu_items add column if not exists manual_unavailable boolean not null default false;

create table if not exists public.recipes (
 id uuid primary key default gen_random_uuid(),
 menu_item_id uuid not null references public.menu_items(id) on delete cascade,
 inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
 quantity_required numeric(14,4) not null check(quantity_required > 0),
 created_at timestamptz not null default now(),
 unique(menu_item_id,inventory_item_id)
);
create table if not exists public.inventory_movements (
 id uuid primary key default gen_random_uuid(),
 movement_date timestamptz not null default now(),
 inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
 movement_type text not null check(movement_type in ('entrada','venta','merma','empleado','cortesia','ajuste')),
 reason text,
 quantity numeric(14,4) not null check(quantity > 0),
 direction text not null check(direction in ('entrada','salida')),
 business text check(business is null or business in ('Coliseo General','Cuervos Pizza','EL CLúB')),
 employee_area text,
 employee_name text,
 order_id uuid references public.orders(id) on delete set null,
 notes text,
 created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists recipes_menu_item_idx on public.recipes(menu_item_id);
create index if not exists inventory_movements_item_idx on public.inventory_movements(inventory_item_id);
create index if not exists inventory_movements_date_idx on public.inventory_movements(movement_date desc);
alter table public.recipes enable row level security;
alter table public.inventory_movements enable row level security;
drop policy if exists "recipes authenticated select" on public.recipes;
create policy "recipes authenticated select" on public.recipes for select to authenticated using (true);
drop policy if exists "recipes admin all" on public.recipes;
create policy "recipes admin all" on public.recipes for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "inventory movements admin all" on public.inventory_movements;
create policy "inventory movements admin all" on public.inventory_movements for all to authenticated using (public.is_admin()) with check (public.is_admin());
create or replace function public.menu_item_can_sell(p_menu_item uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select mi.active and not mi.manual_unavailable from public.menu_items mi where mi.id=p_menu_item),false)
 and not exists (
   select 1 from public.recipes r join public.inventory_items ii on ii.id=r.inventory_item_id
   where r.menu_item_id=p_menu_item
   and (not ii.active or ii.manual_unavailable or ii.current_stock < r.quantity_required)
 );
$$;
create or replace view public.inventory_status as
select ii.*,
 case when ii.manual_unavailable then 'No disponible'
      when ii.current_stock <= 0 then 'Agotado'
      when ii.current_stock <= ii.minimum_stock then 'Existencia baja'
      else 'Disponible' end as stock_status
from public.inventory_items ii;
