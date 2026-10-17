# Revisión y cambios preparados — Coliseo Manager

**Estado actualizado y autorización pendiente:** [AUTORIZACION_V33.md](AUTORIZACION_V33.md).
El historial recuperado, respaldo restaurado, migración única y pruebas reales
de Auth/API locales están descritos en ese documento.

Repositorio base: `ColiseoManager/Coliseo-managerAUCA`, rama `main`.
Commit base: `1e79470641af4a0929a6707fe5b662198301b485`.
Rama de trabajo local: `feat/pending-management-modules`.
Supabase identificado: `vrxkxfsysfnlcuxdsxfx` (Coliseo Manager AUCA).

Esta rama contiene una vista previa aislada; no se modifica la base conectada ni se despliega producción. Las consultas
remotas fueron de lectura de esquema, funciones, permisos y conteos agregados.

## Hallazgos

- Finanzas, servicios, mantenimiento y reservaciones eran tarjetas sin acción.
- Ya existen `operating_expenses`, `maintenance_expenses`, `reservations`,
  `cash_sessions_v31` y `cash_movements_v31`; no es necesario reemplazar Supabase.
- Caja 3.2 sobrescribe los manejadores de Caja 3.1. Los contratos RPC existentes
  se conservan. No se refactorizaron las funciones de comandas, cobros, menú,
  inventario, ventas ni la carga de perfiles/roles.
- Tanto la pantalla como `cash_close_v31` sumaban todas las ventas de la fecha.
  Un segundo turno incluía ventas ya contabilizadas en el primer cierre.
- La política `auth_reservations` permite todas las operaciones a cualquier
  usuario autenticado. La propuesta limita este módulo a Administración.
- La justificación de diferencias de caja se validaba solamente en navegador.
- Las consultas de Caja tenían un límite de 100 sesiones y carecían de orden
  estable al paginar. El nuevo código pagina con orden por ID.
- Se detectó una diferencia de fecha operativa: `orders` tomaba UTC y Caja usaba Tijuana. Se propone cambiar el valor predeterminado de las nuevas comandas, sin reescribir ventas anteriores.
- La política de inventario permitía escrituras a todo usuario autenticado. Las propuestas restringen escrituras directas a Administración y conservan RPC transaccionales para Caja/Personal.
- `add_order_items_v23` no comprobaba que Personal fuera responsable de la cuenta; se prepara esa validación manteniendo el acceso de Administración y Caja.
- La consulta agregada actual encontró cero ventas cerradas sin `closed_at` y
  cero ventas cerradas con método de pago desconocido. No acredita otros datos.

## Cambios

- `js/management.js`: formularios, consultas por intervalo, búsqueda y edición
  para servicios/pagos, gastos de mantenimiento y reservaciones. Sin borrado.
- Servicios: importe pagado, negocio, categoría, periodicidad y vencimiento.
  Mantenimiento: tipo, proveedor, importe, descripción y notas.
- Reservaciones: fecha, hora, cliente, teléfono, personas, paquete, consumo,
  anticipo y estado. La cancelación conserva el registro.
- Finanzas: ventas cobradas, métodos de pago, servicios, mantenimiento y
  resultado parcial. Los gastos de caja se muestran separados: el esquema no
  enlaza esos movimientos con los gastos y sumarlos puede duplicarlos.
- Caja: bloqueo de envíos repetidos durante apertura/cierre, historial paginado
  y exclusión de ventas anteriores al último cierre de la misma fecha.
- `docs/sql/review-before-release.sql`: propuesta transaccional para actualizar
  el cierre en servidor y la política de reservaciones; **no aplicada**.
  Requiere observaciones en todos los cierres y recalcula el importe esperado.

## Alcance de la contabilidad

Los pagos de servicios son registros de gastos ya realizados, no órdenes de
pago ni cargos bancarios. Los vencimientos no generan cobros automáticos.
Los anticipos de reservaciones se registran como referencia; no generan ventas
ni entradas de caja. Se informa al usuario en cada pantalla.

El resultado financiero es parcial: no calcula costo de mercancía, impuestos o
nómina que no estén registrados. No se presenta como utilidad neta completa.
La agenda no bloquea recursos o mesas: el esquema existente no tiene recurso,
capacidad ni hora de fin para comprobar solapamientos.

## Validación realizada

- Navegador Chromium con Supabase simulado: pantallas de los cuatro módulos,
  inserciones/edición, anticipo mayor al consumo rechazado, ventas abiertas
  excluidas del resultado, caracteres HTML tratados como texto, error de
  lectura visible, acceso administrativo y ancho móvil.
- Caja: dos turnos de una fecha, cálculo sin duplicar ventas y cajero sin
  controles de cierre definitivo.
- PostgreSQL aislado mediante PGlite: SQL ejecutado sobre esquema mínimo,
  controles administrativos, observación obligatoria, rechazo de cuentas
  abiertas, segundo turno, cálculo de efectivo, doble cierre rechazado,
  política de reservaciones y ejecución RPC denegada a `anon`.
- Sintaxis de JavaScript y revisión de espacios con Git.

Estas pruebas no sustituyen una sesión real en una copia de Supabase con sus
políticas, vistas, triggers y datos completos. No se registraron pagos de prueba
en producción ni se usó una cuenta real de personal.

## Antes de publicar

1. Crear una copia de prueba de Supabase con el esquema y las políticas actuales;
   usar cuentas de prueba de Administración, Caja y Personal.
2. Aplicar allí el SQL propuesto y probar el código local contra esa copia.
   La pantalla y el RPC de cierre deben desplegarse coordinadamente: no publicar
   el nuevo cálculo de caja manteniendo el RPC viejo.
3. Validar servicios, mantenimiento, creación/edición/cancelación de reservación,
   y lectura denegada a roles no autorizados. Verificar persistencia recargando.
4. Verificar regresión: crear/cobrar comanda, inventario, menú, descuentos,
   cortesías y ventas. Probar dos turnos de caja y movimientos concurrentes.
5. Probar concurrencia real de cobros y cierre: el SQL propuesto bloquea
   escrituras de `orders` durante el cálculo para evitar un cobro entre la
   comprobación de cuentas abiertas y el corte. Verificar tiempo de espera y
   carga en la copia de prueba; PGlite no acredita concurrencia real.
6. Revisar asesores de Supabase sobre la copia y confirmar el alcance de acceso
   a reservaciones. Solo después preparar publicación en Vercel.

## Repetir pruebas locales

Requiere Node, Chromium y Playwright disponibles en el entorno.

```sh
node --check js/management.js
node tests/browser.cjs
```

Para SQL, instalar `@electric-sql/pglite@0.3.14` en un directorio de herramientas
separado y pasar ese `node_modules` por `NODE_PATH`:

```sh
NODE_PATH=/ruta/herramientas/node_modules node tests/database.cjs
```

Las pruebas de navegador interceptan toda la red y las de SQL usan memoria;
ninguna prueba accede a la base real.


## Vista previa de esta rama

Supabase Branching no está disponible en el plan actual (requiere Pro). No se
cambió el plan ni se creó un proyecto con costo. La prueba desplegable usa
PGlite, PostgreSQL en el navegador, con una copia **de la estructura**: 25 tablas,
26 funciones, vistas, triggers, restricciones y políticas. No contiene filas de
producción, contraseñas, claves privadas ni credenciales de personal real.

Se puede entrar mediante botones de Administrador, Caja y Personal. Todos los
registros son ficticios y se reinician al recargar. Los roles de esta demostración
son seleccionables y no equivalen a una autenticación segura multiusuario.
Las consultas sí ejecutan SQL, RPC y RLS en el motor de PostgreSQL aislado.

El build reemplaza el cliente Supabase remoto por el adaptador de prueba,
elimina la URL y la clave publicable reales del HTML generado, y la política
CSP bloquea conexiones a otros dominios. El build rechaza `VERCEL_ENV=production`.
Los cambios no pueden utilizarse todavía como sistema de operación real.

### Autorización pendiente para la base real

Estos tres archivos son propuestas; solo se ejecutan automáticamente en la base
ficticia de la demostración. **No están aplicados en Supabase real**:

- `docs/sql/review-before-release.sql`: fecha operativa Tijuana para nuevas
  comandas, reservaciones solo administrativas y cierre de caja corregido.
- `docs/sql/permissions-before-release.sql`: políticas de inventario y escrituras
  de comandas/cobros, y vistas que respetan RLS.
- `docs/sql/order-ownership-before-release.sql`: Personal puede agregar productos
  únicamente a sus propias comandas.

Aplicarlas a producción requiere autorización, copia de seguridad y verificación
previa en un proyecto Supabase de pruebas. No incluyen borrado de filas.
No se corrigen automáticamente las fechas de ventas históricas: esa revisión
requiere un análisis y una autorización aparte.

### Pruebas adicionales de esta revisión

`node tests/integration.cjs` ejecuta el esquema completo y comprueba los tres
roles, RLS, aislamiento entre comandas de personal, cuentas inactivas, gastos,
reservaciones, menú, recetas, descuento de inventario, cobro sin doble descuento,
movimientos, cierre, segundo turno y totales de ventas.

`node tests/preview.cjs` prueba la aplicación construida en un navegador móvil
contra el motor SQL: formularios, cancelación de reservación, cambio de rol,
comanda, cobro, menú, inventario, finanzas y corte. Detecta errores JavaScript,
desbordamiento horizontal y cualquier petición a Supabase real.

Auth, JWT y PostgREST reales se verificaron después en contenedores locales,
incluido un cobro concurrente con el corte, y con el cliente web real. La
configuración específica del proyecto hospedado y del dominio definitivo sigue
pendiente de verificación tras la autorización. La demostración pública sigue
siendo aislada y no acredita operaciones sobre datos reales.
