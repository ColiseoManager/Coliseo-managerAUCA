// Solo admite el Supabase LOCAL de pruebas. Nunca acepta un dominio remoto.
// Los tokens y contraseñas se mantienen en memoria y no se imprimen.
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
(async () => {
  const file = process.argv[2];
  if (!file) throw Error("Indica el estado JSON privado de Supabase local");
  const status = JSON.parse(fs.readFileSync(file, "utf8"));
  const base = status.API_URL || status.api_url;
  const u = new URL(base);
  if (!["127.0.0.1", "localhost"].includes(u.hostname))
    throw Error("Se rechazó un destino no local");
  const anon = status.ANON_KEY || status.anon_key,
    service = status.SERVICE_ROLE_KEY || status.service_role_key;
  if (!anon || !service) throw Error("Faltan claves exclusivamente locales");
  const dbName =
    process.env.COLISEO_LOCAL_DB_CONTAINER ||
    "supabase_db_coliseo-supabase-local";
  if (dbName !== "supabase_db_coliseo-supabase-local")
    throw Error("Contenedor de prueba no permitido");
  function sql(text) {
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        dbName,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
      ],
      { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  }
  async function http(path, token, { method = "GET", body } = {}) {
    const r = await fetch(base + path, {
      method,
      headers: {
        apikey: anon,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { ok: r.ok, status: r.status, data };
  }
  const request = async (path, token, opts) => {
    const r = await http(path, token, opts);
    if (!r.ok)
      throw Error(
        "Solicitud local falló: " +
          path +
          " código " +
          r.status +
          " " +
          (r.data?.message || r.data?.msg || ""),
      );
    return r.data;
  };
  const users = {};
  for (const role of ["admin", "cashier", "staff", "other"]) {
    const password = crypto.randomBytes(24).toString("base64url");
    const email = role + "-" + crypto.randomUUID() + "@local.test";
    const created = await request("/auth/v1/admin/users", service, {
      method: "POST",
      body: {
        email,
        password,
        email_confirm: true,
        role: "authenticated",
        user_metadata: { full_name: "Prueba " + role },
      },
    });
    const id = created.id || created.user?.id;
    if (!id) throw Error("Auth local no devolvió usuario");
    assert.equal(
      sql(`select role from profiles where id='${id}'`),
      "staff",
      "El trigger crea el perfil con rol seguro",
    );
    const assigned = role === "other" ? "staff" : role;
    sql(`update profiles set role='${assigned}' where id='${id}'`);
    const login = await request("/auth/v1/token?grant_type=password", anon, {
      method: "POST",
      body: { email, password },
    });
    assert.ok(login.access_token);
    users[role] = { id, token: login.access_token };
  }
  const rpc = async (role, name, args) =>
    request("/rest/v1/rpc/" + name, users[role].token, {
      method: "POST",
      body: args,
    });
  const direct = async (role, path, options) =>
    request("/rest/v1/" + path, users[role].token, options);
  for (const role of ["admin", "cashier", "staff"]) {
    const profile = await direct(
      role,
      "profiles?id=eq." + users[role].id + "&select=role,active",
    );
    assert.equal(profile[0].role, role);
    assert.equal(profile[0].active, true);
  }
  const blocked = await http(
    "/rest/v1/profiles?id=eq." + users.staff.id,
    users.staff.token,
    { method: "PATCH", body: { role: "admin" } },
  );
  assert.deepEqual(blocked.data, []);
  assert.deepEqual(await direct("staff", "inventory_items?select=id"), []);
  assert.deepEqual(await direct("staff", "inventory_status?select=id"), []);
  let r = await http("/rest/v1/operating_expenses", users.staff.token, {
    method: "POST",
    body: { category: "Luz", amount: 1 },
  });
  assert.equal(r.status, 403);
  const session = await rpc("cashier", "cash_open_v31", { p_fund: 100 });
  const order = await rpc("staff", "create_order_v2", {
    p_type: "table",
    p_table: "12",
    p_platform: null,
    p_notes: "Prueba Auth local",
    p_lines: [{ id: "40000000-0000-4000-8000-000000000001", q: 2 }],
  });
  r = await http("/rest/v1/rpc/add_order_items_v23", users.other.token, {
    method: "POST",
    body: {
      p_order: order.order_id,
      p_lines: [{ id: "40000000-0000-4000-8000-000000000002", q: 1 }],
    },
  });
  assert.equal(r.ok, false);
  r = await http("/rest/v1/rpc/close_order_v2", users.staff.token, {
    method: "POST",
    body: { p_order: order.order_id, p_payment: "Efectivo" },
  });
  assert.equal(r.ok, false);
  await rpc("cashier", "close_order_v2", {
    p_order: order.order_id,
    p_payment: "Efectivo",
  });
  assert.equal(
    sql(
      "select current_stock from inventory_items where id='30000000-0000-4000-8000-000000000001'",
    ),
    "48.00",
  );
  await rpc("cashier", "cash_move_v32", {
    p_session: session,
    p_kind: "expense",
    p_amount: 20,
    p_reason: "Gasto de prueba",
    p_business: "General",
  });
  r = await http("/rest/v1/rpc/cash_close_v31", users.cashier.token, {
    method: "POST",
    body: {
      p_session: session,
      p_counted: 380,
      p_next: 100,
      p_notes: "Prueba",
    },
  });
  assert.equal(r.ok, false);
  await rpc("admin", "cash_close_v31", {
    p_session: session,
    p_counted: 380,
    p_next: 100,
    p_notes: "Sin incidencias",
  });
  const closed = await direct(
    "admin",
    "cash_sessions_v31?id=eq." + session + "&select=expected_cash,difference",
  );
  assert.equal(Number(closed[0].expected_cash), 380);
  assert.equal(Number(closed[0].difference), 0);
  // Concurrencia real PostgreSQL: el corte debe esperar una escritura de ventas
  // y contabilizar el cobro confirmado antes de adquirir el bloqueo compartido.
  const next = await rpc("cashier", "cash_open_v31", { p_fund: 100 });
  const second = await rpc("staff", "create_order_v2", {
    p_type: "takeaway",
    p_table: "",
    p_platform: null,
    p_notes: "Prueba concurrente",
    p_lines: [{ id: "40000000-0000-4000-8000-000000000002", q: 1 }],
  });
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      dbName,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let signal = "";
  const locked = new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => {
      signal += d.toString();
      if (signal.includes("VENTA_EN_CURSO")) resolve();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(Error("Falló la escritura local concurrente"));
    });
  });
  const finished = new Promise((resolve, reject) => {
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error("Falló la escritura local concurrente")),
    );
  });
  child.stdin.end(
    `begin;update orders set status='closed',payment_method='Efectivo',closed_at=now() where id='${second.order_id}';\n\\echo VENTA_EN_CURSO\nselect pg_sleep(1);commit;\n`,
  );
  await locked;
  await rpc("admin", "cash_close_v31", {
    p_session: next,
    p_counted: 150,
    p_next: 100,
    p_notes: "Prueba de concurrencia",
  });
  await finished;
  const c2 = await direct(
    "admin",
    "cash_sessions_v31?id=eq." +
      next +
      "&select=expected_cash,sales_cash,difference",
  );
  assert.equal(Number(c2[0].sales_cash), 50);
  assert.equal(Number(c2[0].expected_cash), 150);
  assert.equal(Number(c2[0].difference), 0);
  sql(`update profiles set active=false where id='${users.staff.id}'`);
  r = await http("/rest/v1/rpc/create_order_v2", users.staff.token, {
    method: "POST",
    body: {
      p_type: "table",
      p_table: "1",
      p_platform: null,
      p_notes: "Cuenta inactiva",
      p_lines: [{ id: "40000000-0000-4000-8000-000000000001", q: 1 }],
    },
  });
  assert.equal(r.ok, false);
  console.log(
    "PASS: Supabase LOCAL real: Auth por contraseña, creación de perfiles, JWT, tres roles, RLS por API, propiedad de comandas, inventario, cobro, caja y concurrencia PostgreSQL. Cero acceso al proyecto remoto.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
