# Coliseo App — etapa 1: Cocina y Barra

Estado: diseño técnico preparado; NO implementado ni publicado.

## Objetivo
Separar las líneas de cada comanda en Cocina (alimentos) y Barra (bebidas), conservando la misma cuenta y flujo de cobro. Evitar modificar las comandas existentes durante la preparación del módulo.

## Datos verificados
- `orders`: id, table_number, order_type, delivery_platform, notes, status, opened_at.
- `order_items`: id, order_id, menu_item_id, item_name, quantity, business, created_at.
- `menu_items`: id, business, subcategory_id, name.
- `profiles.role`: restricción actual solo admin/staff/cashier.

## Diseño de datos pendiente de migración
1. `menu_items.preparation_station`: kitchen/bar/none. El administrador clasifica cada artículo. No inferir estación exclusivamente del negocio: un negocio puede vender productos de ambas áreas.
2. `preparation_tickets`: order_item_id (único), station, status (pending/preparing/ready), queued_at, started_at, ready_at, updated_by. Conservar el inicio por línea de pedido, incluso si se agregan artículos a la misma cuenta.
3. `preparation_settings`: station, warning_minutes, late_minutes, updated_by, updated_at; edición solo admin.
4. Extender roles a kitchen/bar. Revisar políticas RLS de órdenes y artículos para limitar lectura y mutaciones por estación. Los roles kitchen/bar no deben acceder a precios, costos, finanzas ni datos de clientes.
5. Triggers idempotentes al insertar líneas en `order_items`, y manejo explícito de modificaciones y anulaciones. Validar reglas de estados y autorización en la base de datos, no solo en UI.

## Pantallas
- Cocina y Barra: pendientes, preparando, listos; cronómetro desde `order_items.created_at`; mesa/para llevar/delivery, nombre, cantidad y notas pertinentes.
- Administrador: ambas estaciones, configuración de umbrales y reasignación de productos.
- Autoactualización y recuperación de estado después de recargar.
- Un cronómetro por nueva línea, no por cuenta.

## Criterios de aceptación
- Pizza y cerveza en la misma cuenta aparecen en estaciones distintas.
- La adición posterior de otra pizza genera un cronómetro independiente.
- Solo administrador cambia umbrales; roles de estación solo avanzan estados de su estación.
- Los pedidos ya abiertos y sus totales no cambian por la migración.
- No se muestran precios ni costos a cocina/barra.
- Pruebas con cuentas de ensayo antes de publicar; ninguna comanda real se modifica para probar.

## Etapas posteriores
Menú digital público con QR; registro y verificación por correo (SMS requiere proveedor); código horario de acceso entregado por mesero; validación de mesa; cuentas individuales/compartidas; edición de recetas e insumos solo admin; ícono Coliseo App para Android/iOS.
