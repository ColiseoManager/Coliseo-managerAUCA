-- PROPUESTA V33: PENDIENTE DE AUTORIZACIÓN PARA SUPABASE REAL.
-- No crea tablas, no borra filas y no cambia ventas históricas.
-- Aplicar una sola vez como nueva migración; las 15 anteriores ya están registradas.
begin;
do $$ begin
 if to_regclass('public.orders') is null or to_regclass('public.cash_sessions_v31') is null
   or to_regprocedure('public.cash_close_v31(uuid,numeric,numeric,text)') is null
   or to_regprocedure('public.add_order_items_v23(uuid,jsonb)') is null
 then raise exception 'La estructura base no coincide; detener para revisar migraciones'; end if;
 if (select count(*) from pg_policies where schemaname='public' and (tablename,policyname) in
   (('reservations','auth_reservations'),('inventory_items','auth_inventory'),
    ('orders','orders insert own cashier'),('orders','orders admin cashier update'),
    ('order_items','items insert own cashier'))) <> 5
 then raise exception 'Las políticas base no coinciden; detener para revisar'; end if;
end $$;
-- PROPUESTA: no ejecutada en el proyecto conectado.
-- Aplicar y probar primero en una copia de Supabase, junto con index.html.
-- Conserva filas y tablas existentes. No incluye borrados de datos.

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

-- PROPUESTA adicional, validada solo en el entorno aislado.
-- Requiere autorización antes de aplicarla en Supabase real.
-- Sin cambios a filas; conserva el acceso por RPC a comandas y cobros.

-- El personal consulta disponibilidad mediante menu_item_can_sell, no modifica
-- directamente existencias. La gestión de inventario es administrativa.
alter policy auth_inventory on public.inventory_items
  using (public.is_admin()) with check (public.is_admin());
-- Las comandas se crean y cobran con RPC transaccionales que validan precio,
-- permisos y existencias; impedir saltarse esas validaciones con escrituras API.
alter policy "orders insert own cashier" on public.orders
  with check (public.is_admin());
alter policy "orders admin cashier update" on public.orders
  using (public.is_admin()) with check (public.is_admin());
alter policy "items insert own cashier" on public.order_items
  with check (public.is_admin());
-- Las vistas deben respetar las políticas de las tablas que consultan.
alter view public.inventory_status set (security_invoker=true);
alter view public.product_profitability set (security_invoker=true);

-- Propuesta: Personal solo agrega productos a sus propias comandas.
-- No aplicada a la base real. Conserva permisos de Administración y Caja.

CREATE OR REPLACE FUNCTION public.add_order_items_v23(p_order uuid, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_order public.orders%ROWTYPE;
  v_line jsonb;
  v_menu public.menu_items%ROWTYPE;
  v_qty integer;
  v_new_total numeric := 0;
  v_adjustments numeric := 0;
  v_rec record;
  v_item public.inventory_items%ROWTYPE;
  v_bottles integer;
  v_events jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
BEGIN
  SELECT role INTO v_role FROM public.profiles
  WHERE id=auth.uid() AND active=true;
  IF v_role IS NULL OR v_role NOT IN ('admin','staff','cashier') THEN
    RAISE EXCEPTION 'Sin permiso para agregar productos';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'open' THEN
    RAISE EXCEPTION 'La cuenta no está abierta';
  END IF;
  IF v_role='staff' AND v_order.created_by IS DISTINCT FROM auth.uid() AND v_order.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso para modificar esta cuenta';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array'
     OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Debes seleccionar entre 1 y 100 productos';
  END IF;

  -- Guardar nuevas líneas sin modificar las líneas ya confirmadas.
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_line->'id')<>'string'
       OR jsonb_typeof(v_line->'q')<>'number'
       OR (v_line->>'q') !~ '^[0-9]{1,3}$' THEN
      RAISE EXCEPTION 'Producto o cantidad inválida';
    END IF;
    v_qty := (v_line->>'q')::integer;
    IF v_qty NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Cantidad permitida: 1 a 100';
    END IF;
    SELECT * INTO v_menu FROM public.menu_items
    WHERE id=(v_line->>'id')::uuid AND active=true AND manual_unavailable=false;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM public.menu_subcategories s
      JOIN public.menu_categories c ON c.id=s.category_id
      WHERE s.id=v_menu.subcategory_id AND s.active AND c.active
    ) THEN
      RAISE EXCEPTION 'Producto no disponible';
    END IF;

    INSERT INTO public.order_items
      (order_id,menu_item_id,item_name,unit_price,quantity,line_total,business)
    VALUES
      (p_order,v_menu.id,v_menu.name,v_menu.price,v_qty,v_menu.price*v_qty,v_menu.business);
    v_new_total := v_new_total + v_menu.price*v_qty;
    v_lines := v_lines || jsonb_build_object('id',v_menu.id,'qty',v_qty);
  END LOOP;

  -- Inventario solo de los nuevos productos, agrupado por insumo.
  FOR v_rec IN
    SELECT r.inventory_item_id, sum(r.quantity_required*(x->>'qty')::integer) AS qty
    FROM jsonb_array_elements(v_lines) x
    JOIN public.recipes r ON r.menu_item_id=(x->>'id')::uuid
    GROUP BY r.inventory_item_id ORDER BY r.inventory_item_id
  LOOP
    SELECT * INTO v_item FROM public.inventory_items
    WHERE id=v_rec.inventory_item_id FOR UPDATE;
    IF NOT FOUND OR NOT v_item.active OR v_item.manual_unavailable
       OR v_item.current_stock < v_rec.qty THEN
      RAISE EXCEPTION 'Inventario insuficiente: %',coalesce(v_item.name,'insumo');
    END IF;
    IF v_item.display_unit='botella' AND v_rec.qty>coalesce(v_item.open_bottle_ml,0) THEN
      IF coalesce(v_item.quantity_per_display_unit,0)<=0 THEN
        RAISE EXCEPTION 'Botella sin contenido válido';
      END IF;
      v_bottles := ceil((v_rec.qty-coalesce(v_item.open_bottle_ml,0))/v_item.quantity_per_display_unit)::integer;
      INSERT INTO public.bottle_open_events
        (inventory_item_id,order_id,bottle_ml,automatic,opened_by)
      SELECT v_item.id,p_order,v_item.quantity_per_display_unit,true,auth.uid()
      FROM generate_series(1,v_bottles);
      v_events := v_events || jsonb_build_object('name',v_item.name,'count',v_bottles);
    END IF;
    UPDATE public.inventory_items
    SET current_stock=current_stock-v_rec.qty,updated_at=now()
    WHERE id=v_item.id;
    INSERT INTO public.inventory_movements
      (inventory_item_id,movement_type,reason,quantity,direction,order_id,created_by)
    VALUES (v_item.id,'venta','Consumo adicional en cuenta abierta',
            v_rec.qty,'salida',p_order,auth.uid());
  END LOOP;

  -- Respeta cortesías y descuentos ya autorizados.
  SELECT coalesce(sum(amount),0) INTO v_adjustments
  FROM public.order_adjustments WHERE order_id=p_order;
  UPDATE public.orders
  SET total=greatest(0,
    (SELECT coalesce(sum(unit_price*quantity),0)
     FROM public.order_items WHERE order_id=p_order)-v_adjustments),
    updated_by=auth.uid(),updated_at=now()
  WHERE id=p_order RETURNING * INTO v_order;

  RETURN jsonb_build_object('order_id',p_order,'total',v_order.total,
                            'added_amount',v_new_total,'opened_bottles',v_events);
END;
$function$
;

commit;
