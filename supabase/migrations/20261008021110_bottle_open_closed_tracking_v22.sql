
alter table public.inventory_items add column if not exists open_bottle_ml numeric(14,4) not null default 0;
alter table public.inventory_items add column if not exists open_bottle_count integer not null default 0;
create or replace function public.open_inventory_bottle(p_item uuid,p_remaining_ml numeric default null)
returns void language plpgsql security definer set search_path=public as $$
declare x public.inventory_items%rowtype; v numeric;
begin
 if not public.is_admin() then raise exception 'Solo administrador'; end if;
 select * into x from public.inventory_items where id=p_item for update;
 if not found or x.display_unit <> 'botella' then raise exception 'Insumo no es botella'; end if;
 v:=coalesce(p_remaining_ml,x.quantity_per_display_unit);
 if v<=0 or v>x.quantity_per_display_unit then raise exception 'Contenido inválido'; end if;
 if x.current_stock-x.open_bottle_ml<x.quantity_per_display_unit then raise exception 'No quedan botellas cerradas'; end if;
 update public.inventory_items set open_bottle_ml=open_bottle_ml+v,
 open_bottle_count=open_bottle_count+1,
 current_stock=current_stock-(x.quantity_per_display_unit-v),
 updated_at=now() where id=p_item;
end $$;
grant execute on function public.open_inventory_bottle(uuid,numeric) to authenticated;
create or replace function public.bottle_outflow_track() returns trigger language plpgsql security definer set search_path=public as $$
declare x public.inventory_items%rowtype; v numeric; extra numeric; n integer;
begin
 if new.direction <> 'salida' then return new; end if;
 select * into x from public.inventory_items where id=new.inventory_item_id for update;
 if not found or x.display_unit <> 'botella' then return new; end if;
 v:=x.open_bottle_ml-new.quantity;
 n:=x.open_bottle_count;
 while v<0 and x.quantity_per_display_unit>0 loop
   v:=v+x.quantity_per_display_unit;
   n:=n+1;
 end loop;
 if v=0 then n:=0;
 elsif v>0 then n:=greatest(1,ceil(v/x.quantity_per_display_unit)::integer); end if;
 update public.inventory_items set open_bottle_ml=greatest(v,0),open_bottle_count=n where id=x.id;
 return new;
end $$;
drop trigger if exists bottle_outflow_track_trigger on public.inventory_movements;
create trigger bottle_outflow_track_trigger after insert on public.inventory_movements for each row execute function public.bottle_outflow_track();
