alter table public.cash_movements_v31 add column if not exists business text not null default 'General' check (business in ('General','Cuervos Pizza','EL CLúB'));
drop policy if exists cash_sessions_cashier_select_v32 on public.cash_sessions_v31;
create policy cash_sessions_cashier_select_v32 on public.cash_sessions_v31 for select to authenticated using (public.is_cashier() and status='open');
drop policy if exists cash_movements_cashier_select_v32 on public.cash_movements_v31;
create policy cash_movements_cashier_select_v32 on public.cash_movements_v31 for select to authenticated using (public.is_cashier() and exists (select 1 from public.cash_sessions_v31 s where s.id=session_id and s.status='open'));
create or replace function public.cash_open_v31(p_fund numeric) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not (public.is_admin() or public.is_cashier()) then raise exception 'Sin permiso para abrir caja'; end if;
 if p_fund is null or p_fund<0 or p_fund>1000000 then raise exception 'Fondo inválido'; end if;
 insert into public.cash_sessions_v31(business_date,opening_fund) values ((now() at time zone 'America/Tijuana')::date,p_fund) returning id into v_id;
 return v_id;
end $$;
create or replace function public.cash_move_v32(p_session uuid,p_kind text,p_amount numeric,p_reason text,p_business text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not (public.is_admin() or public.is_cashier()) then raise exception 'Sin permiso para registrar movimientos'; end if;
 perform 1 from public.cash_sessions_v31 where id=p_session and status='open' for update;
 if not found then raise exception 'La caja ya está cerrada'; end if;
 if p_kind not in ('entry','expense','withdrawal') or p_amount is null or p_amount<=0 or p_amount>1000000 or nullif(trim(p_reason),'') is null or length(trim(p_reason))>500 then raise exception 'Movimiento inválido'; end if;
 if p_business not in ('General','Cuervos Pizza','EL CLúB') then raise exception 'Selecciona el negocio'; end if;
 insert into public.cash_movements_v31(session_id,kind,amount,reason,business) values(p_session,p_kind,p_amount,trim(p_reason),p_business) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.cash_move_v31(uuid,text,numeric,text) from authenticated;
revoke all on function public.cash_move_v32(uuid,text,numeric,text,text) from public;
grant execute on function public.cash_move_v32(uuid,text,numeric,text,text) to authenticated;
grant select on public.cash_sessions_v31,public.cash_movements_v31 to authenticated;