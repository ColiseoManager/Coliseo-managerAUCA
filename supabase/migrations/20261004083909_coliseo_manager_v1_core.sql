
create extension if not exists pgcrypto;
create table public.daily_closings (
 id uuid primary key default gen_random_uuid(), business_date date not null, day_type text not null default 'Día normal',
 cuervos_sales numeric(12,2) not null default 0, club_sales numeric(12,2) not null default 0, other_income numeric(12,2) not null default 0,
 expenses numeric(12,2) not null default 0, customers integer not null default 0, occupied_tables integer not null default 0,
 promotion text, notes text, created_at timestamptz not null default now()
);
create table public.events (
 id uuid primary key default gen_random_uuid(), event_date date not null, name text not null, event_type text,
 budget numeric(12,2) not null default 0, actual_cost numeric(12,2) not null default 0, attendees integer not null default 0,
 sales_generated numeric(12,2) not null default 0, result text, repeat_decision text, learnings text, created_at timestamptz not null default now()
);
create table public.reservations (
 id uuid primary key default gen_random_uuid(), event_date date not null, start_time time, customer_name text not null, phone text,
 guest_count integer not null default 1, package_name text, agreed_consumption numeric(12,2) not null default 0,
 deposit numeric(12,2) not null default 0, status text not null default 'Apartado', notes text, created_at timestamptz not null default now()
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), expense_date date not null, business text not null default 'Coliseo', category text not null,
 supplier text, description text, amount numeric(12,2) not null, payment_method text, created_at timestamptz not null default now()
);
create table public.inventory_items (
 id uuid primary key default gen_random_uuid(), business text not null, name text not null, category text, unit text not null default 'pieza',
 current_stock numeric(12,2) not null default 0, minimum_stock numeric(12,2) not null default 0, unit_cost numeric(12,2) not null default 0,
 active boolean not null default true, updated_at timestamptz not null default now(), unique(business,name)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), area text not null default 'General', title text not null, priority text not null default 'Media',
 status text not null default 'Pendiente', responsible text, due_date date, estimated_cost numeric(12,2) not null default 0, notes text,
 created_at timestamptz not null default now()
);
