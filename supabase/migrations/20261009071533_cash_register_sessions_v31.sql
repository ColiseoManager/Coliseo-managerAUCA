create table if not exists public.cash_sessions_v31 (
 id uuid primary key default gen_random_uuid(),
 business_date date not null,
 opened_at timestamptz not null default now(),
 opened_by uuid not null default auth.uid(),
 opening_fund numeric(12,2) not null check(opening_fund>=0),
 status text not null default 'open' check(status in ('open','closed')),
 closed_at timestamptz,
 closed_by uuid,
 counted_cash numeric(12,2) check(counted_cash>=0),
 expected_cash numeric(12,2),
 difference numeric(12,2),
 next_fund numeric(12,2) check(next_fund>=0),
 notes text not null default '',
 sales_cash numeric(12,2),
 sales_card numeric(12,2),
 sales_transfer numeric(12,2),
 sales_other numeric(12,2),
 constraint close_fields_v31 check(status='open' or (closed_at is not null and counted_cash is not null and expected_cash is not null and difference is not null and next_fund is not null))
);
create unique index if not exists only_one_open_cash_session_v31 on public.cash_sessions_v31 ((status)) where status='open';
create table if not exists public.cash_movements_v31 (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.cash_sessions_v31(id),
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid(),
 kind text not null check(kind in ('entry','expense','withdrawal')),
 amount numeric(12,2) not null check(amount>0),
 reason text not null check(length(trim(reason))>0)
);
create index if not exists cash_movements_session_v31 on public.cash_movements_v31(session_id);
alter table public.cash_sessions_v31 enable row level security;
alter table public.cash_movements_v31 enable row level security;
create policy cash_sessions_admin_select_v31 on public.cash_sessions_v31 for select to authenticated using (public.is_admin());
create policy cash_movements_admin_select_v31 on public.cash_movements_v31 for select to authenticated using (public.is_admin());
create or replace function public.cash_open_v31(p_fund numeric) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.is_admin() then raise exception 'Solo administración'; end if;
 if p_fund is null or p_fund<0 then raise exception 'Fondo inválido'; end if;
 insert into public.cash_sessions_v31(business_date,opening_fund) values ((now() at time zone 'America/Tijuana')::date,p_fund) returning id into v_id;
 return v_id;
end $$;
create or replace function public.cash_move_v31(p_session uuid,p_kind text,p_amount numeric,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.is_admin() then raise exception 'Solo administración'; end if;
 perform 1 from public.cash_sessions_v31 where id=p_session and status='open' for update;
 if not found then raise exception 'La caja ya está cerrada'; end if;
 if p_kind not in ('entry','expense','withdrawal') or p_amount is null or p_amount<=0 or nullif(trim(p_reason),'') is null then raise exception 'Movimiento inválido'; end if;
 insert into public.cash_movements_v31(session_id,kind,amount,reason) values(p_session,p_kind,p_amount,trim(p_reason)) returning id into v_id;
 return v_id;
end $$;
create or replace function public.cash_close_v31(p_session uuid,p_counted numeric,p_next numeric,p_notes text default '') returns void language plpgsql security definer set search_path=public as $$
declare s public.cash_sessions_v31%rowtype; v_cash numeric; v_card numeric; v_transfer numeric; v_other numeric; v_entries numeric; v_out numeric; v_expected numeric; v_open integer;
begin
 if not public.is_admin() then raise exception 'Solo administración'; end if;
 select * into s from public.cash_sessions_v31 where id=p_session for update;
 if not found or s.status<>'open' then raise exception 'La caja no está abierta'; end if;
 if p_counted is null or p_counted<0 or p_next is null or p_next<0 or p_next>p_counted then raise exception 'Importes de cierre inválidos'; end if;
 select count(*) into v_open from public.orders where business_date=s.business_date and status='open';
 if v_open>0 then raise exception 'Hay cuentas abiertas. Ciérralas antes de cerrar caja'; end if;
 select coalesce(sum(total) filter(where lower(coalesce(payment_method,''))='efectivo'),0),
 coalesce(sum(total) filter(where lower(coalesce(payment_method,''))='tarjeta'),0),
 coalesce(sum(total) filter(where lower(coalesce(payment_method,''))='transferencia'),0),
 coalesce(sum(total) filter(where lower(coalesce(payment_method,'')) not in ('efectivo','tarjeta','transferencia')),0)
 into v_cash,v_card,v_transfer,v_other from public.orders where business_date=s.business_date and status='closed';
 if v_other<>0 then raise exception 'Hay cobros con método no identificado. Corrígelos antes de cerrar caja'; end if;
 select coalesce(sum(amount) filter(where kind='entry'),0),coalesce(sum(amount) filter(where kind in ('expense','withdrawal')),0) into v_entries,v_out from public.cash_movements_v31 where session_id=p_session;
 v_expected:=s.opening_fund+v_cash+v_entries-v_out;
 update public.cash_sessions_v31 set status='closed',closed_at=now(),closed_by=auth.uid(),counted_cash=p_counted,expected_cash=v_expected,difference=p_counted-v_expected,next_fund=p_next,notes=coalesce(p_notes,''),sales_cash=v_cash,sales_card=v_card,sales_transfer=v_transfer,sales_other=v_other where id=p_session;
end $$;
revoke all on function public.cash_open_v31(numeric),public.cash_move_v31(uuid,text,numeric,text),public.cash_close_v31(uuid,numeric,numeric,text) from public;
grant execute on function public.cash_open_v31(numeric),public.cash_move_v31(uuid,text,numeric,text),public.cash_close_v31(uuid,numeric,numeric,text) to authenticated;
grant select on public.cash_sessions_v31,public.cash_movements_v31 to authenticated;