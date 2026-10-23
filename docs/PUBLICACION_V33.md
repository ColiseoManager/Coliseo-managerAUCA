# Preparación V33 — actualización del 17 de octubre de 2026

Estado: preparación técnica terminada en la rama `feat/pending-management-modules`; publicación pendiente de comprobaciones reales de acceso y configuración privada de Auth. No se fusionó main ni se publicó en Vercel.

## Producción y rama

`vercel.json` y `vercel.release.json` seleccionan `npm run build:release`, salida `dist`, Supabase real `https://vrxkxfsysfnlcuxdsxfx.supabase.co` y CSP compatible. El build exige `COLISEO_RELEASE_AUTHORIZED=v33-reviewed`, elimina residuos previos y solo incluye index.html y js/management.js. No contiene el adaptador demo, semillas, PGlite, fixtures, respaldos o credenciales privadas. La clave del navegador es publishable.

Los despliegues Git están desactivados explícitamente con `git.deploymentEnabled=false`, para subir esta rama sin publicar. No habilitarlos antes de la autorización separada. `vercel.preview.json` conserva la configuración de demostración exclusivamente para pruebas; el servidor local de preview utiliza ese archivo. El SDK externo continúa en @2; fijar una versión revisada mejoraría reproducibilidad.

Proyecto Vercel: `coliseo-manager`, `prj_iGta1G3OonnlQXnXeeymLkaep4kO`, equipo coliseomanager. No se cambió la configuración remota del proyecto ni sus alias.

## Correcciones seguras aplicadas a Supabase

V33 sigue aplicada una sola vez, versión remota `20261017052418`. Adicionalmente se aplicó, conforme a la autorización de corregir seguridad sin afectar usuarios, `coliseo_v33_security_preparation`, versión remota `20261017060626` (archivo local `20261017060524_coliseo_v33_security_preparation.sql`).

- Se fijó search_path=public en convert_inventory_quantity e inventory_yield, sin cambiar su lógica.
- Se retiró EXECUTE de PUBLIC y anon a 23 funciones SECURITY DEFINER. Se conservaron los permisos efectivos previos de authenticated y service_role. Las funciones y triggers internos siguen funcionando; el cliente utiliza usuarios autenticados.
- El asesor ya no detecta funciones privilegiadas ejecutables por anon ni search_path mutable. No hay ERROR.
- Permanecen 23 avisos de funciones SECURITY DEFINER accesibles a authenticated. El acceso es necesario para RPC/roles/triggers; siguen existiendo controles de rol y propiedad. No se eliminó indiscriminadamente este permiso.
- Sigue desactivada la protección de contraseñas filtradas. No está expuesta por las herramientas de configuración disponibles.

Referencias: [funciones accesibles a authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Se respaldaron las definiciones/ACL previas de funciones y se actualizó la copia de las 25 tablas públicas, fuera del repositorio, antes de aplicar. Se restauraron los 49 registros en PostgreSQL aislado y se verificó su coincidencia. La estructura base procede del snapshot V33 previamente verificado; las definiciones de funciones y ACL se actualizaron. Es un respaldo lógico de aplicación, excluye credenciales/sesiones Auth y Storage, y no representa una recuperación completa de Supabase.

Después se compararon todas las filas de las 25 tablas: exactamente iguales. Las cuatro comandas, incluida la abierta, siguen intactas. No se cerraron cuentas ni se alteraron ventas, inventario, usuarios o roles comerciales.

Las versiones locales y remotas de ambas migraciones difieren porque Supabase asignó la versión al ejecutarlas. La correspondencia y los SHA están documentados en migration-history.json. No ejecutar db push, reaplicar V33 ni los SQL anteriores antes de conciliar el historial con una revisión específica. Publicar el frontend no requiere ejecutar SQL.

## Autenticación: comprobado y pendiente

El endpoint público /auth/v1/settings responde correctamente: acceso por correo habilitado, confirmación de correo requerida y registro público habilitado. No expone Site URL ni la lista de redirect URLs. Las herramientas Supabase conectadas permiten SQL/asesores/migraciones, pero no leer ni modificar la configuración privada Auth del Management API. No se intentó obtener secretos desde tablas ni saltarse esta limitación.

Pendiente revisar en Authentication → URL Configuration: Site URL `https://coliseo-manager.vercel.app` y redirect permitido del mismo dominio para invitaciones/recuperación. Conservar URLs legítimas de usuarios existentes hasta revisar su uso; no abrir comodines amplios. Revisar SMTP y entrega de invitaciones. También conviene desactivar nuevas altas públicas si todas las cuentas serán invitadas, manteniendo el acceso de cuentas existentes, y habilitar protección de contraseñas filtradas si el plan lo permite. Para completar estos cambios hace falta acceso de configuración Auth mediante Supabase Management API o intervención del propietario en el panel; la conexión SQL actual no ofrece esa capacidad.

Pruebas repetidas con Supabase Auth, PostgREST, PostgreSQL 17 y supabase-js reales en contenedores aislados, con credenciales ficticias: login/logout de Administrador, Personal y Caja; JWT, perfiles y trigger, RLS, propiedad de comandas, inventario, cobros, módulos y cierre concurrente. El navegador móvil pasó el flujo con la corrección de seguridad aplicada.

En Supabase real se comprobaron permisos por transacciones de solo lectura: Administrador ve cuatro comandas e inventario; Personal ve sus dos comandas y no inventario administrativo. Estas consultas no prueban una contraseña ni el cierre de una sesión real. No hay credenciales/sesiones reales disponibles de Administrador o Personal; no se resetearon contraseñas, crearon sesiones por suplantación ni revocaron sesiones existentes. Hace falta que los titulares validen inicio/cierre de sesión real antes de publicar.

## Crear la cuenta Caja: procedimiento pendiente, no ejecutado

Información necesaria del usuario: **nombre completo y correo electrónico del titular de Caja**. No enviar contraseñas.

1. Revisar URLs de Auth y SMTP; comprobar que el correo no corresponde a una cuenta existente.
2. Invitar desde Authentication → Users del proyecto AUCA. El titular establece su contraseña mediante el enlace seguro.
3. Confirmar el perfil creado por el trigger con el mismo UUID; inicia con rol staff.
4. Un operador autorizado cambia solamente ese perfil a role=cashier, active=true y el nombre. No insertar manualmente en auth.users ni utilizar user_metadata para decidir permisos.
5. El titular valida login/logout desde su celular y la pantalla Caja. Comprobar consulta de comandas y denegación de administración, sin crear cobros ficticios en la base real.

Caja puede abrir turno, registrar movimientos y cobrar; el cierre definitivo de Caja diaria corresponde a Administrador. La prueba aislada de Caja ya está preparada y pasó, sin crear una cuenta comercial real.

## Condiciones para publicar

- Validación real de login/logout por los titulares de Administrador y Personal.
- Revisión privada de URLs/SMTP y protección de contraseñas; política de registro público.
- Creación y validación de la cuenta Caja con el correo y nombre solicitados.
- Autorización separada de publicación. Hasta entonces mantener Git deploymentEnabled=false y no fusionar main.

No hay migraciones pendientes necesarias para servir esta versión. La comanda abierta debe resolverse por el flujo comercial normal para poder cerrar su fecha operativa; no impide publicar el frontend.

Al autorizar producción, seleccionar una revisión exacta y el build real, comprobar el artefacto y desplegar de forma controlada. Publicar no debe ejecutar migraciones ni pruebas que creen ventas ficticias. Conservar el frontend anterior para rollback; no ejecutar rollback-v33.sql sin autorización específica.

Limitaciones funcionales conocidas: Finanzas calcula resultado parcial, no utilidad contable neta; servicios registra pagos realizados, no cargos automáticos; los anticipos de reservación son referencias y no generan ventas/caja; no hay bloqueo de aforo/recurso. La publicación no modifica estas reglas.
