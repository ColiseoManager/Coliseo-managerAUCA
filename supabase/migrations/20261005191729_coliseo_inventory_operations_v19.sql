
alter table public.orders add column if not exists inventory_processed boolean not null default false;

create or replace function public.record_inventory_movement(
 p_item uuid, p_type text, p_reason text, p_quantity numeric, p_direction text,
 p_business text default null, p_employee_area text default null, p_employee_name text default null,
 p_notes text default null, p_order uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_stock numeric;
begin
 if not public.is_admin() then raise exception 'Solo administrador'; end if;
 if p_quantity<=0 or p_direction not in ('entrada','salida') then raise exception 'Movimiento inválido'; end if;
 select current_stock into v_stock from inventory_items where id=p_item for update;
 if not found then raise exception 'Insumo no encontrado'; end if;
 if p_direction='salida' and v_stock<p_quantity then raise exception 'Existencia insuficiente'; end if;
 update inventory_items set current_stock=current_stock + case when p_direction='entrada' then p_quantity else -p_quantity end, updated_at=now() where id=p_item;
 insert into inventory_movements(inventory_item_id,movement_type,reason,quantity,direction,business,employee_area,employee_name,notes,order_id,created_by)
 values(p_item,p_type,p_reason,p_quantity,p_direction,p_business,p_employee_area,p_employee_name,p_notes,p_order,auth.uid()) returning id into v_id;
 return v_id;
end $$;
grant execute on function public.record_inventory_movement(uuid,text,text,numeric,text,text,text,text,text,uuid) to authenticated;

create or replace function public.process_order_inventory(p_order uuid)
returns void language plpgsql security definer set search_path=public as $$
declare rec record; v_stock numeric;
begin
 if not (public.is_admin() or public.is_cashier()) then raise exception 'Sin permiso'; end if;
 if exists(select 1 from orders where id=p_order and inventory_processed) then return; end if;
 for rec in
  select r.inventory_item_id, sum(r.quantity_required*oi.quantity) qty
  from order_items oi join recipes r on r.menu_item_id=oi.menu_item_id
  where oi.order_id=p_order group by r.inventory_item_id
 loop
  select current_stock into v_stock from inventory_items where id=rec.inventory_item_id for update;
  if v_stock < rec.qty then raise exception 'Inventario insuficiente para cerrar la cuenta'; end if;
 end loop;
 for rec in
  select r.inventory_item_id, sum(r.quantity_required*oi.quantity) qty
  from order_items oi join recipes r on r.menu_item_id=oi.menu_item_id
  where oi.order_id=p_order group by r.inventory_item_id
 loop
  update inventory_items set current_stock=current_stock-rec.qty,updated_at=now() where id=rec.inventory_item_id;
  insert into inventory_movements(inventory_item_id,movement_type,reason,quantity,direction,order_id,created_by)
  values(rec.inventory_item_id,'venta','Venta',rec.qty,'salida',p_order,auth.uid());
 end loop;
 update orders set inventory_processed=true where id=p_order;
end $$;
grant execute on function public.process_order_inventory(uuid) to authenticated;
