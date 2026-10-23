
create table if not exists public.menu_categories (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 sort_order int not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.menu_subcategories (
 id uuid primary key default gen_random_uuid(),
 category_id uuid not null references public.menu_categories(id) on delete cascade,
 name text not null,
 sort_order int not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(category_id,name)
);
create table if not exists public.menu_items (
 id uuid primary key default gen_random_uuid(),
 subcategory_id uuid not null references public.menu_subcategories(id) on delete cascade,
 name text not null,
 price numeric(12,2) not null default 0 check(price>=0),
 active boolean not null default true,
 sort_order int not null default 0,
 created_at timestamptz not null default now(),
 unique(subcategory_id,name)
);
alter table public.sales add column if not exists table_number text;
alter table public.sales add column if not exists menu_item_id uuid references public.menu_items(id);
alter table public.sales add column if not exists quantity int not null default 1 check(quantity>0);

alter table public.menu_categories enable row level security;
alter table public.menu_subcategories enable row level security;
alter table public.menu_items enable row level security;

drop policy if exists "menu categories read" on public.menu_categories;
create policy "menu categories read" on public.menu_categories for select to authenticated using (active=true or public.is_admin());
drop policy if exists "menu categories admin all" on public.menu_categories;
create policy "menu categories admin all" on public.menu_categories for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists "menu subcategories read" on public.menu_subcategories;
create policy "menu subcategories read" on public.menu_subcategories for select to authenticated using (active=true or public.is_admin());
drop policy if exists "menu subcategories admin all" on public.menu_subcategories;
create policy "menu subcategories admin all" on public.menu_subcategories for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists "menu items read" on public.menu_items;
create policy "menu items read" on public.menu_items for select to authenticated using (active=true or public.is_admin());
drop policy if exists "menu items admin all" on public.menu_items;
create policy "menu items admin all" on public.menu_items for all to authenticated using(public.is_admin()) with check(public.is_admin());
