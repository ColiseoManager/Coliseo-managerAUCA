-- Preparación propuesta, NO aplicada a producción.
-- Migración aditiva para revisión antes de despliegue.
create table if not exists public.preparation_settings (
 station text primary key check (station in ('kitchen','bar')),
 warning_minutes integer not null check (warning_minutes > 0),
 late_minutes integer not null check (late_minutes > warning_minutes),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
insert into public.preparation_settings(station,warning_minutes,late_minutes)
values ('kitchen',10,20),('bar',5,10) on conflict(station) do nothing;
alter table public.preparation_settings enable row level security;
create policy "preparation_settings_admin" on public.preparation_settings
 for all to authenticated using (public.is_admin()) with check (public.is_admin());
create table if not exists public.preparation_item_routes (
 menu_item_id uuid primary key references public.menu_items(id) on delete cascade,
 station text not null check (station in ('kitchen','bar','none')),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
alter table public.preparation_item_routes enable row level security;
create policy "preparation_routes_admin" on public.preparation_item_routes
 for all to authenticated using (public.is_admin()) with check (public.is_admin());
create table if not exists public.preparation_tickets (
 order_item_id uuid primary key references public.order_items(id) on delete cascade,
 station text not null check (station in ('kitchen','bar')),
 status text not null default 'pending' check (status in ('pending','preparing','ready','cancelled')),
 queued_at timestamptz not null,
 started_at timestamptz,
 ready_at timestamptz,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
create index if not exists prep_station_status_idx on public.preparation_tickets(station,status,queued_at);
alter table public.preparation_tickets enable row level security;
create policy "preparation_tickets_admin" on public.preparation_tickets
 for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Pendiente: roles kitchen/bar, funciones de actualización de estado, reglas RLS por estación,
-- disparadores de enrutamiento, backfill cuidadosamente revisado, interfaz y pruebas.
