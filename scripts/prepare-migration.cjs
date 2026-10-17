// Genera únicamente archivos locales; no se conecta a Supabase.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const schema = require("../tests/fixtures/schema-2026-10-17.json");
const dir = path.join(__dirname, "../supabase/migrations");
const files = fs
  .readdirSync(dir)
  .filter((n) => n.endsWith("_coliseo_operational_safety_v33.sql"));
if (files.length !== 1)
  throw Error("Debe existir un archivo generado por supabase migration new.");
const names = [
  "review-before-release.sql",
  "permissions-before-release.sql",
  "order-ownership-before-release.sql",
];
const bodies = names.map((n) =>
  fs
    .readFileSync(path.join(__dirname, "../docs/sql", n), "utf8")
    .replace(/^begin;\s*$/gim, "")
    .replace(/^commit;\s*$/gim, ""),
);
const preflight = `do $$ begin
 if to_regclass('public.orders') is null or to_regclass('public.cash_sessions_v31') is null
   or to_regprocedure('public.cash_close_v31(uuid,numeric,numeric,text)') is null
   or to_regprocedure('public.add_order_items_v23(uuid,jsonb)') is null
 then raise exception 'La estructura base no coincide; detener para revisar migraciones'; end if;
 if (select count(*) from pg_policies where schemaname='public' and (tablename,policyname) in
   (('reservations','auth_reservations'),('inventory_items','auth_inventory'),
    ('orders','orders insert own cashier'),('orders','orders admin cashier update'),
    ('order_items','items insert own cashier'))) <> 5
 then raise exception 'Las políticas base no coinciden; detener para revisar'; end if;
end $$;`;
const content =
  "-- PROPUESTA V33: PENDIENTE DE AUTORIZACIÓN PARA SUPABASE REAL.\n-- No crea tablas, no borra filas y no cambia ventas históricas.\n-- Aplicar una sola vez como nueva migración; las 15 anteriores ya están registradas.\nbegin;\n" +
  preflight +
  "\n" +
  bodies.join("\n") +
  "\ncommit;\n";
fs.writeFileSync(path.join(dir, files[0]), content);
let rollback =
  "-- REVERSIÓN DE ESTRUCTURA V33. Requiere autorización; nunca automática.\n-- Conserva las filas creadas durante la operación. No revierte datos históricos.\nbegin;\n";
const column = schema.tables
  .find((t) => t.name === "orders")
  .columns.find((c) => c.name === "business_date");
rollback +=
  "alter table public.orders alter column business_date set default " +
  column.default +
  ";\n";
const policies = new Set([
  "auth_reservations",
  "auth_inventory",
  "orders insert own cashier",
  "orders admin cashier update",
  "items insert own cashier",
]);
const q = (s) => '"' + s.replaceAll('"', '""') + '"';
for (const p of schema.policies.filter((p) => policies.has(p.policyname)))
  rollback += `alter policy ${q(p.policyname)} on public.${q(p.tablename)} to ${p.roles.map(q).join(",")}${p.qual ? " using (" + p.qual + ")" : ""}${p.with_check ? " with check (" + p.with_check + ")" : ""};\n`;
for (const v of ["inventory_status", "product_profitability"])
  rollback += `alter view public.${q(v)} reset (security_invoker);\n`;
for (const name of ["cash_close_v31", "add_order_items_v23"])
  rollback += schema.functions.find((f) => f.name === name).sql + ";\n";
// ACL original de cash_close_v31 observada en Supabase: postgres, anon,
// authenticated y service_role. PUBLIC no tenía EXECUTE.
rollback +=
  "revoke all on function public.cash_close_v31(uuid,numeric,numeric,text) from public;\ngrant execute on function public.cash_close_v31(uuid,numeric,numeric,text) to anon,authenticated,service_role;\ncommit;\n";
fs.writeFileSync(
  path.join(__dirname, "../docs/sql/rollback-v33.sql"),
  rollback,
);
console.log(
  JSON.stringify({
    migration: files[0],
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
  }),
);
