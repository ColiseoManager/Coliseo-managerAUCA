
alter table public.recipes
  add column if not exists input_quantity numeric(14,4),
  add column if not exists input_unit text;

update public.recipes r
set input_quantity = coalesce(input_quantity, quantity_required),
    input_unit = coalesce(input_unit, (select coalesce(i.display_unit,i.unit,i.base_unit,'pieza') from public.inventory_items i where i.id=r.inventory_item_id))
where input_quantity is null or input_unit is null;

create or replace function public.convert_inventory_quantity(p_quantity numeric, p_from text, p_to text)
returns numeric
language plpgsql immutable
as $$
declare f text:=lower(trim(coalesce(p_from,''))); t text:=lower(trim(coalesce(p_to,'')));
begin
  if p_quantity is null then return null; end if;
  if f=t then return p_quantity; end if;
  if f in ('kg','kilogramo','kilogramos') and t in ('g','gramo','gramos') then return p_quantity*1000; end if;
  if f in ('g','gramo','gramos') and t in ('kg','kilogramo','kilogramos') then return p_quantity/1000; end if;
  if f in ('l','lt','litro','litros') and t in ('ml','mililitro','mililitros') then return p_quantity*1000; end if;
  if f in ('ml','mililitro','mililitros') and t in ('l','lt','litro','litros') then return p_quantity/1000; end if;
  if f in ('pieza','piezas','unidad','unidades','botella','botellas','lata','latas') and t in ('pieza','piezas','unidad','unidades','botella','botellas','lata','latas') then return p_quantity; end if;
  raise exception 'No se puede convertir % a %',p_from,p_to;
end $$;

create or replace function public.inventory_yield(p_inventory_item uuid, p_serving_quantity numeric, p_serving_unit text)
returns table(stock_quantity numeric, stock_unit text, servings integer, remainder numeric)
language plpgsql stable
as $$
declare s numeric; u text; req numeric;
begin
 select current_stock, coalesce(display_unit,unit,base_unit,'pieza') into s,u
 from public.inventory_items where id=p_inventory_item;
 if not found then raise exception 'Insumo no encontrado'; end if;
 req:=public.convert_inventory_quantity(p_serving_quantity,p_serving_unit,u);
 if req<=0 then raise exception 'La porción debe ser mayor a cero'; end if;
 stock_quantity:=s; stock_unit:=u; servings:=floor(s/req); remainder:=s-(servings*req);
 return next;
end $$;

grant execute on function public.convert_inventory_quantity(numeric,text,text) to authenticated;
grant execute on function public.inventory_yield(uuid,numeric,text) to authenticated;
