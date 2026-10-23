
alter table public.menu_items add column if not exists unit_cost numeric(12,2) not null default 0 check(unit_cost>=0);

create table if not exists public.operating_expenses (
 id uuid primary key default gen_random_uuid(),
 expense_date date not null default current_date,
 scope text not null default 'Coliseo General' check(scope in ('Coliseo General','Cuervos Pizza','EL CLúB')),
 category text not null check(category in ('Renta','Agua','Luz','Internet','Música','Televisión','Publicidad','Permisos','Otro')),
 subcategory text,
 description text,
 amount numeric(12,2) not null check(amount>0),
 recurrence text check(recurrence is null or recurrence in ('Único','Mensual','Anual','Otro')),
 renewal_date date,
 notes text,
 created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);

create table if not exists public.maintenance_expenses (
 id uuid primary key default gen_random_uuid(),
 expense_date date not null default current_date,
 scope text not null default 'Coliseo General' check(scope in ('Coliseo General','Cuervos Pizza','EL CLúB')),
 category text not null,
 description text,
 amount numeric(12,2) not null check(amount>0),
 supplier text,
 notes text,
 created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);

alter table public.operating_expenses enable row level security;
alter table public.maintenance_expenses enable row level security;
drop policy if exists "operating admin all" on public.operating_expenses;
create policy "operating admin all" on public.operating_expenses for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "maintenance admin all" on public.maintenance_expenses;
create policy "maintenance admin all" on public.maintenance_expenses for all to authenticated using(public.is_admin()) with check(public.is_admin());

create or replace view public.product_profitability as
select
 mi.id as menu_item_id,
 mi.name,
 mi.business,
 mi.price as sale_price,
 mi.unit_cost,
 (mi.price-mi.unit_cost) as unit_profit,
 case when mi.price>0 then round(((mi.price-mi.unit_cost)/mi.price)*100,2) else 0 end as margin_pct,
 coalesce(sum(case when o.status='closed' then oi.quantity else 0 end),0)::bigint as units_sold,
 coalesce(sum(case when o.status='closed' then oi.line_total else 0 end),0)::numeric(12,2) as revenue,
 coalesce(sum(case when o.status='closed' then oi.quantity*mi.unit_cost else 0 end),0)::numeric(12,2) as product_cost,
 coalesce(sum(case when o.status='closed' then oi.line_total-(oi.quantity*mi.unit_cost) else 0 end),0)::numeric(12,2) as gross_profit
from public.menu_items mi
left join public.order_items oi on oi.menu_item_id=mi.id
left join public.orders o on o.id=oi.order_id
group by mi.id,mi.name,mi.business,mi.price,mi.unit_cost;
