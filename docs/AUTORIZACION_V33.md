# Coliseo Manager: propuesta pendiente de autorización final

La base real no se ha modificado y producción sigue en `main`.
La rama de revisión es `feat/pending-management-modules`, PR #1.

## Revisión de migraciones

Se leyeron las **15 migraciones registradas** en Supabase y se recuperaron sus
archivos exactos, con versiones y SHA-256 en `docs/migration-history.json`.
No se ejecutaron de nuevo. La estructura actual coincide con el snapshot previo.
Hay funciones actuales, como `create_order_v2` y `add_order_items_v23`, que no
figuran en esos archivos históricos. Por eso las pruebas parten de la estructura
actual exportada, no de recrear producción únicamente con el historial antiguo.

Se propone **una sola migración nueva**, generada con Supabase CLI:
`supabase/migrations/20261017045545_coliseo_operational_safety_v33.sql`.
Las propuestas anteriores de `docs/sql` son fuentes de esta consolidación;
no se deben ejecutar además de la migración V33.

## Cambios que requieren autorización en Supabase real

| Área | Cambio | Efecto |
| --- | --- | --- |
| Fecha operativa | Predeterminado de nuevas comandas en `America/Tijuana` | Coincide con Caja diaria; no reescribe ventas históricas |
| Reservaciones | Política administrativa | Caja y Personal no consultan ni cambian reservaciones |
| Inventario | Escrituras directas solo administrativas | Personal y Caja venden mediante RPC con validación de existencias |
| Comandas | Escrituras directas y vistas sujetas a permisos | Evita omitir las validaciones de precio e inventario |
| Propiedad de comandas | Personal agrega productos solo en cuentas propias/asignadas | Administración y Caja mantienen su acceso |
| Cierre diario | Excluye ventas de cortes anteriores, valida datos y exige observaciones | Evita duplicaciones entre turnos |
| Cobros concurrentes | Bloqueo de escrituras de ventas durante el cálculo del corte | El corte espera cobros en curso; puede haber una espera breve |

No se crean tablas duplicadas, no se borra información, no se cambian usuarios,
contraseñas o roles existentes y no se modifican importes o fechas históricas.
La migración tiene comprobaciones previas y es transaccional. Si no encuentra
los objetos/políticas esperados, se detiene.

Reversión de estructura preparada: `docs/sql/rollback-v33.sql`. No se ejecuta
sola y también exige autorización; restaura las reglas anteriores, incluidas sus
limitaciones. No borra las operaciones registradas después de publicar.

## Respaldo realizado

Snapshot consistente mediante una consulta de solo lectura del
**17/10/2026 a las 04:54:54 UTC**, con estructura pública, datos de las **25 tablas
(49 registros)** e historial de migraciones. El archivo privado está fuera del
repositorio y no se incluye en Vercel.

Se restauró en una base en memoria, se comprobaron las claves foráneas y se
comparó el contenido de las 25 tablas. Resultado: coincidencia completa.

SHA-256 del respaldo comprimido:
`33805df76efd3a569bdaf07fe997cb4c6c27cfd51a7e7a877e8a47de35543961`.

Es un respaldo lógico de la aplicación. **No incluye credenciales/sesiones de
Auth ni una copia completa del servicio Supabase**. En la consulta no había
buckets ni objetos de Storage. Antes de una aplicación autorizada se actualizará
el respaldo para incluir las operaciones que hayan ocurrido mientras tanto.
El usuario debe descargarlo para conservarlo fuera de este espacio temporal.

## Verificación

- Historial: 15 archivos idénticos al remoto y una sola propuesta pendiente.
- Migración consolidada: aplicación repetida, ausencia de cambios a datos,
  reversión y nueva aplicación comprobadas en PostgreSQL aislado.
- Aplicación móvil de prueba: los cinco módulos, menú, comanda, cobro,
  inventario, finanzas, cancelación de reservación y corte de caja.
- Motor SQL completo con RPC/RLS: cuentas de Administración, Caja, Personal,
  otro Personal y cuenta inactiva; acceso y operaciones denegados según rol.
- Cliente `supabase-js` real en navegador móvil contra los servicios locales:
  inicio/cierre de sesión sin errores del SDK y flujo de los cinco módulos.
- Auth y PostgREST reales en contenedores locales, con PostgreSQL 17: contraseña,
  JWT, trigger de creación de perfiles, políticas por API, comandas propias,
  inventario, cobro, dos turnos de caja y cobro/corte concurrentes.

Las credenciales y los datos de estas pruebas son ficticios y locales.
La vista previa pública sigue siendo la demostración aislada del navegador;
los servicios de Auth locales no se exponen en Vercel.

## Qué falta para publicar definitivamente

1. Revisión del usuario del enlace móvil y de esta propuesta.
2. **Autorización final explícita para aplicar la V33 al Supabase real**.
3. Justo antes de aplicarla: comprobar otra vez historial/estructura y actualizar
   el respaldo. Ejecutar una sola migración, verificar sus efectos y revisar
   los asesores de Supabase. Ninguna corrección de datos históricos es automática.
4. Activar el build de operación real ya preparado (`build:release` y
   `vercel.release.json`), con login de Supabase y sin el adaptador de demostración.
   Requiere habilitación explícita; no es la configuración activa en Vercel.
   Comprobar las URLs de Auth y el acceso en el dominio definitivo.
5. **Autorización separada para publicar en producción**, despliegue coordinado
   con la V33 y comprobación de acceso real. Las pruebas que crean ventas deberán
   hacerse con datos de prueba autorizados, no sobre información comercial real.

Todavía no se solicita aplicar ni publicar: los archivos quedan listos para
revisión y no hay operaciones automáticas sobre el proyecto remoto.
