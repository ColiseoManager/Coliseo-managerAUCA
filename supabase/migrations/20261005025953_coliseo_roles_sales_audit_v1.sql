
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'staff' check (role in ('admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_date date not null default current_date,
  business text not null check (business in ('Cuervos Pizza','EL CLúB','Otro')),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null,
  changed_by uuid default auth.uid(),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.sales enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sales authenticated insert" on public.sales;
create policy "sales authenticated insert" on public.sales
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "sales read own or admin" on public.sales;
create policy "sales read own or admin" on public.sales
for select to authenticated
using (created_by = auth.uid() or public.is_admin());

drop policy if exists "sales admin update" on public.sales;
create policy "sales admin update" on public.sales
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sales admin delete" on public.sales;
create policy "sales admin delete" on public.sales
for delete to authenticated
using (public.is_admin());

drop policy if exists "audit admin read" on public.audit_log;
create policy "audit admin read" on public.audit_log
for select to authenticated using (public.is_admin());

create or replace function public.audit_sales_changes()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.audit_log(table_name,record_id,action,changed_by,old_data,new_data)
    values ('sales',new.id,'UPDATE',auth.uid(),to_jsonb(old),to_jsonb(new));
    new.updated_at = now();
    new.updated_by = auth.uid();
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log(table_name,record_id,action,changed_by,old_data,new_data)
    values ('sales',old.id,'DELETE',auth.uid(),to_jsonb(old),null);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_sales_changes on public.sales;
create trigger trg_audit_sales_changes
before update or delete on public.sales
for each row execute function public.audit_sales_changes();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,full_name,role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), 'staff')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_coliseo on auth.users;
create trigger on_auth_user_created_coliseo
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles(id,full_name,role)
select id, coalesce(raw_user_meta_data->>'full_name', split_part(email,'@',1)), 'admin'
from auth.users
order by created_at asc
limit 1
on conflict (id) do update set role='admin', active=true;
