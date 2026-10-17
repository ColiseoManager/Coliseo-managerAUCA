const fs = require("node:fs");
const path = require("node:path");
const schema = require("../tests/fixtures/schema-2026-10-17.json");
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
function createSQL({
  source = schema,
  patches = true,
  foreignKeys = true,
  standaloneAuth = true,
} = {}) {
  const schema = source;
  let sql = standaloneAuth
    ? `-- Snapshot de estructura, SIN filas de producción. Solo para pruebas aisladas.
 set check_function_bodies=off;
 create role anon; create role authenticated;
 create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_user::text$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema public,auth to authenticated,anon;
 grant execute on all functions in schema auth to authenticated,anon;
 `
    : "set check_function_bodies=off;\n";
  for (const t of schema.tables) {
    sql += `create table public.${ident(t.name)} (${t.columns.map((c) => `${ident(c.name)} ${c.type}${c.default ? " default " + c.default : ""}${c.notnull ? " not null" : ""}`).join(",")});\n`;
  }
  for (const c of schema.constraints.filter(
    (c) => !c.definition.startsWith("FOREIGN KEY"),
  ))
    sql += `alter table ${c.table} add constraint ${ident(c.name)} ${c.definition};\n`;
  for (const c of schema.constraints.filter(
    (c) => foreignKeys && c.definition.startsWith("FOREIGN KEY"),
  ))
    sql += `alter table ${c.table} add constraint ${ident(c.name)} ${c.definition};\n`;
  for (const f of schema.functions) sql += f.sql + ";\n";
  for (const v of schema.views)
    sql += `create view public.${ident(v.name)}${v.options ? " with (" + v.options.join(",") + ")" : ""} as ${v.sql}\n`;
  for (const t of schema.triggers || []) sql += t + ";\n";
  for (const i of schema.indexes || []) sql += i + ";\n";
  for (const t of schema.tables.filter((t) => t.rls))
    sql += `alter table public.${ident(t.name)} enable row level security;\n`;
  for (const p of schema.policies)
    sql += `create policy ${ident(p.policyname)} on public.${ident(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(ident).join(",")}${p.qual ? " using (" + p.qual + ")" : ""}${p.with_check ? " with check (" + p.with_check + ")" : ""};\n`;
  sql +=
    "grant select,insert,update,delete on all tables in schema public to authenticated,anon;\n";
  if (patches) {
    const directory = path.join(__dirname, "../supabase/migrations");
    const pending = fs
      .readdirSync(directory)
      .filter((name) => name.endsWith("_coliseo_operational_safety_v33.sql"));
    if (pending.length !== 1)
      throw Error("No hay una única migración V33 revisable");
    sql += fs.readFileSync(path.join(directory, pending[0]), "utf8");
  }
  return sql;
}
module.exports = { createSQL, schema };
