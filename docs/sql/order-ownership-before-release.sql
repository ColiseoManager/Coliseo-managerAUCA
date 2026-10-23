-- Propuesta: Personal solo agrega productos a sus propias comandas.
-- No aplicada a la base real. Conserva permisos de Administración y Caja.
begin;
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
