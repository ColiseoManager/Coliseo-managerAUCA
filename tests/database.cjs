// Ejecutar con NODE_PATH apuntando a una instalación de @electric-sql/pglite@0.3.14.
// PostgreSQL aislado en memoria. Nunca usa Supabase ni credenciales reales.
const { PGlite } = require("@electric-sql/pglite");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const db = new PGlite();
  await db.exec(`
 create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
 create function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.is_admin',true),'false')='true'$$;
 create table reservations(id uuid primary key);
 alter table reservations enable row level security;
 create policy auth_reservations on reservations to authenticated using(true) with check(true);
 create table cash_sessions_v31(id uuid primary key,business_date date,status text,closed_at timestamptz,closed_by uuid,opening_fund numeric,counted_cash numeric,expected_cash numeric,difference numeric,next_fund numeric,notes text,sales_cash numeric,sales_card numeric,sales_transfer numeric,sales_other numeric);
 create table orders(id int primary key,business_date date,status text,closed_at timestamptz,total numeric,payment_method text);
 create table cash_movements_v31(session_id uuid,kind text,amount numeric);
 set test.is_admin='true';
 `);
  await db.exec(
    fs.readFileSync(
      require("node:path").join(
        __dirname,
        "../docs/sql/review-before-release.sql",
      ),
      "utf8",
    ),
  );
  const id = "00000000-0000-0000-0000-000000000002",
    old = "00000000-0000-0000-0000-000000000003";
  await db.query(
    `insert into cash_sessions_v31(id,business_date,status,opening_fund,closed_at) values ($1,current_date,'closed',100,now()-interval '1 hour'),($2,current_date,'open',100,null)`,
    [old, id],
  );
  await db.exec(
    `insert into orders values(1,current_date,'closed',now()-interval '2 hours',200,'Efectivo'),(2,current_date,'closed',now(),50,' Efectivo ');`,
  );
  await db.query(
    `insert into cash_movements_v31 values($1,'entry',20),($1,'expense',10)`,
    [id],
  );
  await assert.rejects(
    () => db.query(`select cash_close_v31($1,160,100,'')`, [id]),
    /observaciones/,
  );
  await db.exec(`set test.is_admin='false'`);
  await assert.rejects(
    () => db.query(`select cash_close_v31($1,160,100,'Sin incidencias')`, [id]),
    /Solo administración/,
  );
  await db.exec(
    `set test.is_admin='true';insert into orders values(3,current_date,'open',null,50,null)`,
  );
  await assert.rejects(
    () => db.query(`select cash_close_v31($1,160,100,'Sin incidencias')`, [id]),
    /cuentas abiertas/,
  );
  await db.exec(`update orders set status='cancelled' where id=3`);
  await db.query(`select cash_close_v31($1,160,100,'Sin incidencias')`, [id]);
  const result = (
    await db.query(
      `select expected_cash::text,difference::text,status from cash_sessions_v31 where id=$1`,
      [id],
    )
  ).rows[0];
  assert.deepEqual(result, {
    expected_cash: "160",
    difference: "0",
    status: "closed",
  });
  await assert.rejects(
    () => db.query(`select cash_close_v31($1,160,100,'Sin incidencias')`, [id]),
    /no está abierta/,
  );
  const policy = (
    await db.query(
      `select qual,with_check from pg_policies where tablename='reservations'`,
    )
  ).rows[0];
  assert.match(policy.qual, /is_admin/);
  assert.match(policy.with_check, /is_admin/);
  await db.exec("set role anon");
  await assert.rejects(
    () =>
      db.query(`select public.cash_close_v31($1,160,100,'Sin incidencias')`, [
        id,
      ]),
    /permission denied/,
  );
  console.log(
    "PASS: SQL ejecutable, autorización, observación obligatoria, bloqueo de cuentas abiertas, dos turnos sin duplicar ventas, cierre único y política de reservaciones (Postgres aislado).",
  );
  await db.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
