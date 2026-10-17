-- PROPUESTA adicional, validada solo en el entorno aislado.
-- Requiere autorización antes de aplicarla en Supabase real.
-- Sin cambios a filas; conserva el acceso por RPC a comandas y cobros.
begin;
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
commit;
