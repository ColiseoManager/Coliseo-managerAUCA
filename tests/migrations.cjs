const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { createSQL } = require("../scripts/test-schema.cjs");
(async () => {
  const pg = new PGlite();
  await pg.exec(createSQL({ patches: false }));
  await pg.exec("create role service_role");
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
  await pg.close();
  console.log(
    "PASS: migración consolidada aplicada dos veces, sin duplicar ni modificar datos; reversión y nueva aplicación verificadas.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
