# Preparación de publicación V33 — 17 de octubre de 2026

Estado: código preparado para revisión; publicación condicionada a los pendientes de este informe. No se publicó, fusionó main, creó una cuenta ni escribió información comercial durante esta preparación.

## Configuración y artefacto

Proyecto Vercel verificado: `coliseo-manager`, `prj_iGta1G3OonnlQXnXeeymLkaep4kO`, equipo `coliseomanager`, Node 24.x. La configuración activa `vercel.json` sigue construyendo la demostración; no se cambió el proyecto remoto. La consulta de variables de Vercel no devolvió variables configuradas ni ocultas de producción.

Configuración real preparada: `vercel.release.json`, comando `npm run build:release`, salida `dist`. Requiere `COLISEO_RELEASE_AUTHORIZED=v33-reviewed` al construir. Esta variable habilita un build; no autoriza un despliegue. Se utilizó solamente en pruebas locales.

El build real prepara una carpeta limpia con lista explícita: `index.html` y `js/management.js`. Rechaza referencias al adaptador demo, PGlite, semillas y claves privadas. La prueba introduce residuos ficticios en dist y confirma que desaparecen. No publica fixtures, SQL, respaldos, node_modules ni archivos de preview.

La aplicación utiliza Supabase `https://vrxkxfsysfnlcuxdsxfx.supabase.co` y una clave pública publishable existente. No necesita service_role en el navegador. La CSP permite el SDK de jsDelivr y HTTPS/WSS únicamente al proyecto real para datos. El SDK permanece en su versión flotante @2: fijar una versión revisada mejoraría la reproducibilidad.

## Supabase y pruebas

Se volvieron a consultar las 16 migraciones: 15 originales y una V33. La fecha operativa America/Tijuana, las políticas administrativas de inventario/reservaciones, las vistas security_invoker y las funciones V33 están instaladas. No se ejecutaron migraciones.

Archivo aprobado: `20261017045545_coliseo_operational_safety_v33.sql`. Versión asignada por Supabase al aplicarlo: `20261017052418`. La correspondencia y SHA están en migration-history.json. Antes de cualquier futuro `supabase db push`, conciliar el historial local/remoto con revisión específica; no reaplicar V33 ni ejecutar las propuestas de docs/sql. Esta diferencia no afecta al build estático ni requiere otra migración para publicar.

Consulta real de solo lectura: un Administrador y un Personal activos, ningún Caja; cuatro comandas existentes, una abierta, un artículo de inventario y cero reservaciones. Las comandas no se cerraron ni se alteraron. Una comanda abierta impedirá cerrar su fecha operativa hasta resolverla mediante el flujo comercial normal.

Pruebas locales ejecutadas en esta preparación: navegador con API simulada; esquema completo PostgreSQL aislado con RLS y roles Administrador/Caja/Personal; comandas propias y ajenas; recetas e inventario; cobro sin doble descuento; servicios, mantenimiento y reservaciones; movimientos y dos turnos de caja; migración sin cambios de datos y reversión; historial y build real limpio. También se había validado previamente Auth/PostgREST/PostgreSQL 17 locales con el SDK real y contraseñas ficticias. Esas pruebas locales no equivalen a un login real del dominio publicado.

Caja puede abrir caja, registrar movimientos, crear comandas y cobrar. El cierre definitivo de Caja diaria es exclusivo de Administrador según V33. Personal tiene acceso a comandas propias/asignadas y no administra inventario, reservaciones ni cierres.

## Cuenta real Caja: procedimiento preparado, no ejecutado

1. Obtener del titular correo, nombre y autorización para crear la cuenta. Confirmar que el correo no corresponde a una cuenta existente.
2. En Supabase del proyecto AUCA, Authentication → Users, invitar al usuario. Revisar previamente Site URL y redirect URLs del dominio definitivo y el servicio SMTP. La invitación permite al titular establecer su contraseña; no enviar contraseñas por documentos o repositorio.
3. Confirmar que el trigger creó exactamente un registro profiles con el mismo UUID de Authentication. El rol inicial es staff. No insertar manualmente en auth.users y no usar el rol Auth/JWT para asignar permisos comerciales.
4. Un operador autorizado asignará en public.profiles de ese UUID exacto `role = cashier`, `active = true` y el nombre. Revisar el UUID y la fila antes de guardar; no cambiar otras cuentas. Es una operación futura separada, no incluida en este trabajo.
5. El titular inicia sesión desde el celular y confirma que ve Caja, puede consultar las comandas permitidas y no ve Administración. Validar cierre de sesión e inactividad. No efectuar cobros ficticios ni movimientos en la base comercial; validar escrituras en el entorno aislado.
6. Conservar un Administrador activo: es quien realiza el cierre definitivo.

## Pendientes para autorizar la publicación

- Comprobación de login/logout real por el titular y URLs de Auth en el dominio final. No se dispuso de contraseña real ni se simuló una sesión como prueba de contraseña.
- Crear y validar la cuenta Caja siguiendo el procedimiento anterior, con autorización y correo del titular.
- Revisar las advertencias de seguridad detectadas al aplicar V33: dos funciones con search_path mutable, funciones SECURITY DEFINER ejecutables por anon/authenticated (revisar sus controles individualmente) y protección de contraseñas filtradas desactivada. V33 eliminó los dos errores de vistas; estas advertencias preexistentes no se corrigieron aquí.
- Revisar el alcance funcional: Finanzas muestra resultado parcial, no utilidad contable neta; servicios registra pagos ya realizados, sin cobro automático; anticipos de reservaciones son referencias y no generan ventas/caja; no existe bloqueo de aforo o recurso por reservación.
- Autorización separada del usuario para producción. No fusionar main ni desplegar automáticamente antes de ella.

## Secuencia de publicación futura

Tras resolver los pendientes y obtener autorización, revisar el diff y confirmar la revisión exacta a publicar. Usar explícitamente `vercel.release.json` como configuración local de Vercel (opción `--local-config` del CLI elegido), no el vercel.json de demostración. Habilitar el build real para ese build autorizado, comprobar artefacto y CSP y publicar en el proyecto/equipo verificados. No ejecutar migraciones como parte del build ni cambiar los alias antes de aprobar la publicación. Si se usa integración Git en lugar del CLI, preparar primero el cambio revisado de configuración activa, porque hoy Git continúa construyendo la demostración.

Después del despliegue autorizado: comprobar HTTPS, carga del SDK, login/logout y navegación por rol sin crear ventas ficticias. Mantener disponible la versión anterior para rollback del frontend; revertir el frontend no revierte Supabase. No ejecutar rollback-v33.sql sin autorización específica.
