# Coliseo Manager AUCA

Rama de revisión para completar Finanzas globales, Servicios y pagos,
Mantenimiento, Reservaciones y Caja diaria.

La configuración activa de esta rama genera una **demostración aislada** con
PostgreSQL en el navegador y datos ficticios. No modifica Supabase real.

- [Propuesta de autorización final V33](docs/AUTORIZACION_V33.md)
- [Revisión técnica y límites](docs/REVISION.md)
- [Historial de migraciones contrastado](docs/migration-history.json)

`npm ci`, `npm test` y `npm run build:preview` verifican y construyen la prueba.
La V33 está preparada en `supabase/migrations`, sin aplicar al proyecto real.
Los 15 archivos históricos recuperados no deben ejecutarse de nuevo.

El build real (`npm run build:release`, `vercel.release.json`) está bloqueado por
defecto y requiere autorización explícita. No es la configuración activa de Vercel.
