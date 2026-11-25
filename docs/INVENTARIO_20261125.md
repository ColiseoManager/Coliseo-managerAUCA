# Inventario — revisión del 25 de noviembre de 2026

## Desarrollo publicado en esta revisión

- Los movimientos de insumos registrados como botellas admiten su unidad base (ml), botella y shot. Se convierten con quantity_per_display_unit y serving_size del insumo; se retiró la referencia fija de 750 ml. Las entradas seleccionadas en botellas cerradas exigen un número entero.
- El consumo del personal exige negocio, área y nombre, que se envían al registro de movimientos. Los ajustes exigen una nota explicativa.
- Se rechazan cantidades no finitas o no positivas y unidades incompatibles. El servidor conserva la comprobación de existencias y permisos.
- Guardar un movimiento y abrir una botella tienen protección frente a doble pulsación. Si el guardado termina pero falla la recarga, se informa que ya se guardó y se pide recargar antes de repetir.
- La carga de insumos, recetas y productos recorre todas las páginas con orden por ID, valida errores de todas las consultas y solo reemplaza la información al completar la lectura. El historial muestra explícitamente los últimos 100 movimientos, con orden estable.
- Se añade búsqueda por insumo/negocio y filtro por disponibilidad. El resumen distingue agotados/no disponibles; las alertas no cuentan perfiles de insumo inactivos y muestran un aviso si falla su consulta.
- El cambio de disponibilidad verifica la respuesta de Supabase y muestra errores, sin presentar un cambio no confirmado como exitoso.

## Comprobaciones realizadas

`tests/inventory-ui.cjs` ejecuta la sección real del frontend con respuestas controladas. Cubre conversiones de unidades, datos del personal, cantidades inválidas, bloqueo de duplicados, fallo de recarga posterior al guardado, roles, presentación de rendimiento y filtros.

`tests/inventory-db.cjs` ejecuta PostgreSQL aislado con el esquema de pruebas del repositorio. Comprueba abrir botellas completas/parciales, consumo del personal con datos de auditoría, seguimiento de volumen abierto, rechazo de salidas sin existencia suficiente y denegación de escrituras a Personal.

Se leyeron las definiciones de open_inventory_bottle, record_inventory_movement y bottle_outflow_track en el proyecto conectado para revisar su contrato. No se hicieron ventas, aperturas ni consumos de prueba en la base conectada. No se aplicaron migraciones ni se ajustaron existencias reales.

Pasaron también las comprobaciones de preparación, usuarios, finanzas, sintaxis y empaquetado. Queda pendiente la prueba visual completa y de titulares reales al final del desarrollo, según lo solicitado por la usuaria. Las pruebas aisladas no equivalen a verificar sesiones reales en producción.
