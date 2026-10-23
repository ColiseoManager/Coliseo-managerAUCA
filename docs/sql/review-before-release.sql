-- PROPUESTA: no ejecutada en el proyecto conectado.
-- Aplicar y probar primero en una copia de Supabase, junto con index.html.
-- Conserva filas y tablas existentes. No incluye borrados de datos.
begin;

-- Nuevas comandas y caja deben compartir la fecha operativa de Tijuana.
-- Cambia solo el valor predeterminado futuro, no las ventas existentes.
alter table public.orders alter column business_date
  set default ((now() at time zone 'America/Tijuana')::date);

-- El módulo nuevo de reservaciones está reservado a Administración.
alter policy auth_reservations on public.reservations
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- Cada cierre calcula únicamente ventas no incluidas en un cierre previo del día.
-- Se conserva el contrato RPC usado por las pantallas existentes.
create or replace function public.cash_close_v31(
  p_session uuid, p_counted numeric, p_next numeric, p_notes text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare
  s public.cash_sessions_v31%rowtype;
  cutoff timestamptz;
  v_cash numeric; v_card numeric; v_transfer numeric; v_other numeric;
  v_entries numeric; v_out numeric; v_expected numeric;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Solo administración'; end if;
  -- Espera cobros en curso e impide cambios en ventas mientras se calcula el corte.
  -- El bloqueo se libera al terminar la transacción.
  lock table public.orders in share mode;
  select * into s from public.cash_sessions_v31 where id=p_session for update;
  if not found or s.status <> 'open' then raise exception 'La caja no está abierta'; end if;
  if p_counted is null or p_next is null or p_counted<0 or p_next<0 or p_next>p_counted
    or p_counted>1000000 or p_next>1000000
    or p_counted<>round(p_counted,2) or p_next<>round(p_next,2)
  then raise exception 'Importes de cierre inválidos'; end if;
  if nullif(trim(p_notes),'') is null then raise exception 'Indica las observaciones del cierre'; end if;
  if exists(select 1 from public.orders where business_date=s.business_date and status='open')
    then raise exception 'Hay cuentas abiertas. Ciérralas antes de cerrar caja'; end if;
  select max(closed_at) into cutoff from public.cash_sessions_v31
    where business_date=s.business_date and status='closed';
  if exists(select 1 from public.orders where business_date=s.business_date and status='closed' and closed_at is null)
    then raise exception 'Hay ventas cobradas sin fecha de cierre; revisar antes del corte'; end if;
  select coalesce(sum(total) filter(where lower(trim(coalesce(payment_method,'')))='efectivo'),0),
    coalesce(sum(total) filter(where lower(trim(coalesce(payment_method,'')))='tarjeta'),0),
    coalesce(sum(total) filter(where lower(trim(coalesce(payment_method,'')))='transferencia'),0),
    coalesce(sum(total) filter(where lower(trim(coalesce(payment_method,''))) not in ('efectivo','tarjeta','transferencia')),0)
  into v_cash,v_card,v_transfer,v_other from public.orders
  where business_date=s.business_date and status='closed' and (cutoff is null or closed_at>cutoff);
  if v_other<>0 then raise exception 'Hay cobros con método no identificado'; end if;
  select coalesce(sum(amount) filter(where kind='entry'),0),
    coalesce(sum(amount) filter(where kind in ('expense','withdrawal')),0)
  into v_entries,v_out from public.cash_movements_v31 where session_id=p_session;
  v_expected:=s.opening_fund+v_cash+v_entries-v_out;
  update public.cash_sessions_v31 set status='closed',closed_at=now(),closed_by=auth.uid(),
    counted_cash=p_counted,expected_cash=v_expected,difference=p_counted-v_expected,
    next_fund=p_next,notes=trim(p_notes),sales_cash=v_cash,sales_card=v_card,
    sales_transfer=v_transfer,sales_other=v_other where id=p_session;
end;
$$;
-- La función conserva SECURITY DEFINER por el acceso de escritura exclusivo por RPC.
-- Solo usuarios autenticados; la autorización administrativa también se exige dentro.
revoke all on function public.cash_close_v31(uuid,numeric,numeric,text) from public, anon;
grant execute on function public.cash_close_v31(uuid,numeric,numeric,text) to authenticated;
commit;
