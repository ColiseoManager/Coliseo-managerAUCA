const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { createSQL } = require("../scripts/test-schema.cjs");
(async () => {
  const pg = new PGlite();
  await pg.exec(createSQL({ patches: false }));
  await pg.exec(
    fs.readFileSync(path.join(__dirname, "../preview/seed.sql"), "utf8"),
  );
  const snapshot = async () => {
    const r = await pg.query(
      "select json_build_object('profiles',(select json_agg(to_jsonb(t)) from profiles t),'stock',(select json_agg(to_jsonb(t)) from inventory_items t),'menu',(select json_agg(to_jsonb(t)) from menu_items t)) as data",
    );
    return r.rows[0].data;
  };
  const original = await snapshot();
  const d = path.join(__dirname, "../supabase/migrations");
  const name = fs
    .readdirSync(d)
    .find((n) => n.endsWith("_coliseo_operational_safety_v33.sql"));
  const sql = fs.readFileSync(path.join(d, name), "utf8");
  await pg.exec(sql);
  await pg.exec(sql);
  assert.deepEqual(
    await snapshot(),
    original,
    "La migración no modifica datos ni crea duplicados",
  );
  let r = await pg.query(
    "select pg_get_expr(d.adbin,d.adrelid) as value from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid='orders'::regclass and a.attname='business_date'",
  );
  assert.match(r.rows[0].value, /America\/Tijuana/);
  await pg.exec(
    fs.readFileSync(
      path.join(__dirname, "../docs/sql/rollback-v33.sql"),
      "utf8",
    ),
  );
  assert.deepEqual(await snapshot(), original);
  r = await pg.query(
    "select pg_get_expr(d.adbin,d.adrelid) as value from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid='orders'::regclass and a.attname='business_date'",
  );
  assert.equal(r.rows[0].value, "CURRENT_DATE");
  await pg.exec(sql);
  assert.deepEqual(await snapshot(), original);
  const security = fs.readFileSync(
    path.join(d, "20261017060524_coliseo_v33_security_preparation.sql"),
    "utf8",
  );
  // ACL real preexistente: cash_move_v31 es legado, solo anon/service_role.
  // El generador de estructura no exporta ACL y PostgreSQL daría PUBLIC por defecto.
  await pg.exec(
    "revoke execute on function cash_move_v31(uuid,text,numeric,text) from public,authenticated; grant execute on function cash_move_v31(uuid,text,numeric,text) to anon,service_role",
  );
  const aclQuery =
    "select proname, has_function_privilege('authenticated',oid,'execute') allowed from pg_proc where pronamespace='public'::regnamespace order by proname";
  const aclBefore = (await pg.query(aclQuery)).rows;
  await pg.exec(security);
  await pg.exec(security);
  assert.deepEqual((await pg.query(aclQuery)).rows, aclBefore);
  assert.equal(
    (
      await pg.query(
        "select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and prosecdef and has_function_privilege('anon',oid,'execute')",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (await pg.query("select public.convert_inventory_quantity(1,'kg','g') n"))
      .rows[0].n,
    "1000",
  );
  assert.deepEqual(await snapshot(), original);
  await pg.close();
  console.log(
    "PASS: migración consolidada aplicada dos veces, sin duplicar ni modificar datos; reversión y nueva aplicación verificadas.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
