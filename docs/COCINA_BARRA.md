# Cocina y Barra — revisión del 25 de noviembre de 2026

## Implementación existente comprobada

El frontend contiene un tablero por estación con Pendiente, Preparando y Listo; cantidad, ubicación y notas, sin precios ni costos. Actualiza cada 15 segundos. Los artículos terminados muestran el tiempo hasta ready_at, sin seguir acumulando minutos.

El proyecto conectado contiene prep_get_board, prep_get_settings, prep_advance_ticket, prep_update_route y prep_update_settings. Se revisaron sus definiciones mediante consultas de lectura; no se cambiaron estados ni artículos reales. prep_advance_ticket exige perfil activo, estación autorizada, cuenta abierta y transiciones pending→preparing→ready, con bloqueo de la fila. El tablero obtiene solo los campos operativos requeridos. La asignación de productos y los tiempos se guardan con RPC administrativa.

## Correcciones de esta revisión

- Cambiar de estación inicia una nueva carga; las respuestas anteriores no sobrescriben el tablero actual. No se conservan visualmente artículos de la estación anterior durante la carga.
- Los perfiles inactivos y roles de otra estación se rechazan también en las acciones del frontend. La autorización real sigue siendo responsabilidad de las funciones de servidor.
- Los cambios de estado se bloquean mientras existe una solicitud para el mismo artículo. Los errores se muestran y se vuelve a consultar el estado persistido.
- La configuración consulta todas las páginas de productos y asignaciones, con orden estable.
- Si falla guardar una estación, el selector vuelve al valor confirmado anteriormente. Los tiempos se validan y los errores de red se muestran sin anunciar un guardado exitoso.
- Los mensajes de esta sección usan Coliseo Manager, sin el encabezado del navegador.
- Se añade actualización manual y se informa la frecuencia automática.
- Se aclara que la nueva asignación de estación afecta a artículos nuevos; los tickets existentes conservan su estación.

## Verificación

`node tests/preparation.cjs` ejecuta el código real de la sección con dobles controlados: respuestas de estaciones fuera de orden, bloqueo de duplicados, errores al cambiar estados y guardar asignaciones, roles, texto escapado, ausencia de precios, duración detenida al terminar, avisos de retraso y paginación de 1,001 productos. Pasaron también las verificaciones de sintaxis, usuarios, finanzas y empaquetado de publicación.

La revisión del código y estas pruebas no sustituyen una sesión real con cuentas Cocina/Barra. No se probaron contraseñas, invitaciones ni concurrencia de sesiones reales en esta revisión. La cuenta cocina01@coliseofoodpark.local continúa pendiente de creación en Auth y de asignación del rol kitchen; recuperar el acceso al panel sigue pendiente. No declarar esa cuenta creada ni el flujo de titulares validado.

No se aplicaron migraciones ni se modificaron los datos comerciales para estas comprobaciones. Las pruebas manuales con la usuaria quedan al final del desarrollo, según su instrucción.
