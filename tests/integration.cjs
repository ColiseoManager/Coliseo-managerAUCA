// Ejercita el esquema completo exportado SIN datos reales; RLS y RPC ejecutados
// por PostgreSQL (PGlite), no sustituidos por respuestas programadas.
const { PGlite } = require("@electric-sql/pglite");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createSQL } = require("../scripts/test-schema.cjs");
const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  cashier: "10000000-0000-4000-8000-000000000002",
  staff: "10000000-0000-4000-8000-000000000003",
  other: "10000000-0000-4000-8000-000000000004",
};
(async () => {
  const pg = new PGlite();
  await pg.exec(createSQL());
  await pg.exec(
    fs.readFileSync(
      require("node:path").join(__dirname, "../preview/seed.sql"),
      "utf8",
    ),
  );
  const as = (role, sql, args = []) =>
    pg.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        ids[role] || "",
      ]);
      await tx.exec("set local role " + (ids[role] ? "authenticated" : "anon"));
      return (await tx.query(sql, args)).rows;
    });
  const rpc = (
    role,
    name,
    args = [],
    placeholders = args.map((_, i) => "$" + (i + 1)).join(","),
  ) =>
    as(role, `select public.${name}(${placeholders}) as result`, args).then(
      (r) => r[0]?.result,
    );
  const fail = async (promise, pattern) =>
    assert.rejects(() => promise, pattern);
  await fail(
    as(
      "staff",
      "insert into operating_expenses(category,amount) values('Luz',10)",
    ),
    /row-level security/,
  );
  assert.equal(
    (await as("staff", "select * from operating_expenses")).length,
    0,
  );
  await fail(
    as(
      "cashier",
      "insert into maintenance_expenses(category,amount) values('Prueba',10)",
    ),
    /row-level security/,
  );
  await fail(
    as(
      "staff",
      "insert into reservations(event_date,customer_name) values(current_date,'Prueba')",
    ),
    /row-level security/,
  );
  assert.equal(
    (
      await as(
        "staff",
        "update profiles set role='admin' where id=auth.uid() returning *",
      )
    ).length,
    0,
  );
  for (const role of ["admin", "cashier", "staff"])
    assert.equal(
      (await as(role, "select role from profiles where id=auth.uid()"))[0].role,
      role,
    );
  assert.equal((await as("staff", "select * from inventory_status")).length, 0);
  assert.equal(
    (
      await as(
        "staff",
        "update inventory_items set current_stock=99999 returning id",
      )
    ).length,
    0,
  );
  await fail(
    as("staff", "insert into orders(table_number,total) values('1',0)"),
    /row-level security/,
  );
  const expense = (
    await as(
      "admin",
      "insert into operating_expenses(category,description,amount) values('Luz','Ficticio',300) returning id",
    )
  )[0].id;
  await as("admin", "update operating_expenses set amount=250 where id=$1", [
    expense,
  ]);
  assert.equal(
    Number(
      (await as("admin", "select amount from operating_expenses"))[0].amount,
    ),
    250,
  );
  await as(
    "admin",
    "insert into maintenance_expenses(category,description,amount) values('Reparación','Ficticia',50)",
  );
  await as(
    "admin",
    "insert into reservations(event_date,start_time,customer_name,phone,guest_count,agreed_consumption,deposit) values(current_date,'18:00','Cliente ficticio','0000000000',5,1000,200)",
  );
  await as("admin", "update reservations set status='Cancelado'");
  assert.equal((await as("staff", "select * from reservations")).length, 0);
  const session = await rpc("cashier", "cash_open_v31", [100]);
  const order = await rpc("staff", "create_order_v2", [
    "table",
    "12",
    null,
    "Prueba",
    JSON.stringify([
      { id: "40000000-0000-4000-8000-000000000001", q: 2 },
      { id: "40000000-0000-4000-8000-000000000002", q: 1 },
    ]),
  ]);
  const id = order.order_id;
  assert.ok(id);
  assert.equal(
    Number(
      (
        await as(
          "admin",
          "select current_stock from inventory_items where name='Pizza de prueba lista'",
        )
      )[0].current_stock,
    ),
    48,
  );
  assert.equal(
    (await as("other", "select id from orders where id=$1", [id])).length,
    0,
  );
  await fail(
    rpc("other", "add_order_items_v23", [
      id,
      JSON.stringify([{ id: "40000000-0000-4000-8000-000000000002", q: 1 }]),
    ]),
    /Sin permiso/,
  );
  await fail(rpc("staff", "close_order_v2", [id, "Efectivo"]), /Sin permiso/);
  await fail(
    rpc("cashier", "cash_close_v31", [session, 450, 100, "Prueba"]),
    /Solo administración/,
  );
  await fail(
    rpc("admin", "cash_close_v31", [session, 450, 100, "Prueba"]),
    /cuentas abiertas/,
  );
  await rpc("cashier", "close_order_v2", [id, "Efectivo"]);
  assert.equal(
    Number(
      (
        await as(
          "admin",
          "select current_stock from inventory_items where name='Pizza de prueba lista'",
        )
      )[0].current_stock,
    ),
    48,
    "Cobrar no debe descontar inventario de nuevo",
  );
  await fail(
    rpc("cashier", "close_order_v2", [id, "Efectivo"]),
    /Cuenta no abierta/,
  );
  const moves = await as(
    "admin",
    "select * from inventory_movements where order_id=$1",
    [id],
  );
  assert.equal(moves.length, 2);
  await rpc("cashier", "cash_move_v32", [
    session,
    "expense",
    20,
    "Pago ficticio",
    "General",
  ]);
  await rpc("cashier", "cash_move_v32", [
    session,
    "entry",
    10,
    "Entrada ficticia",
    "General",
  ]);
  await rpc("admin", "cash_close_v31", [session, 440, 100, "Sin incidencias"]);
  const closed = (
    await as("admin", "select * from cash_sessions_v31 where id=$1", [session])
  )[0];
  assert.equal(Number(closed.expected_cash), 440);
  assert.equal(Number(closed.difference), 0);
  const next = await rpc("cashier", "cash_open_v31", [100]);
  const second = await rpc("cashier", "create_order_v2", [
    "takeaway",
    "",
    null,
    "Prueba segundo turno",
    JSON.stringify([{ id: "40000000-0000-4000-8000-000000000002", q: 1 }]),
  ]);
  await rpc("cashier", "close_order_v2", [second.order_id, "Tarjeta"]);
  await rpc("admin", "cash_close_v31", [next, 100, 100, "Sin incidencias"]);
  const c2 = (
    await as("admin", "select * from cash_sessions_v31 where id=$1", [next])
  )[0];
  assert.equal(Number(c2.sales_cash), 0);
  assert.equal(Number(c2.sales_card), 50);
  assert.equal(Number(c2.expected_cash), 100);
  assert.equal(
    Number(
      (
        await as(
          "admin",
          "select sum(total) as total from orders where status='closed'",
        )
      )[0].total,
    ),
    400,
  );
  assert.equal(
    (await as("cashier", "select * from cash_sessions_v31")).length,
    0,
    "Caja no consulta cierres históricos",
  );
  await fail(
    rpc("staff", "record_inventory_movement", [
      "30000000-0000-4000-8000-000000000001",
      "entrada",
      "Prueba",
      1,
      "entrada",
      null,
      null,
      null,
      null,
      null,
    ]),
    /administrador|permiso|administración/i,
  );
  await fail(
    rpc("anon", "create_order_v2", [
      "table",
      "1",
      null,
      "Prueba",
      JSON.stringify([{ id: "40000000-0000-4000-8000-000000000001", q: 1 }]),
    ]),
    /Sin permiso/,
  );
  await as("admin", "update profiles set active=false where id=$1", [
    ids.staff,
  ]);
  await fail(
    rpc("staff", "create_order_v2", [
      "table",
      "1",
      null,
      "Prueba",
      JSON.stringify([{ id: "40000000-0000-4000-8000-000000000001", q: 1 }]),
    ]),
    /Sin permiso/,
  );
  await pg.close();
  console.log(
    "PASS: esquema completo, tres roles y RLS, servicios, mantenimiento, reservaciones, comandas, recetas/inventario, cobro sin duplicar stock, movimientos, dos turnos de caja y ventas.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
