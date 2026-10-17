// Navegador con supabase-js real contra Auth/PostgREST locales. Nunca admite Supabase remoto.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
(async () => {
  const state = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  if (!["localhost", "127.0.0.1"].includes(new URL(state.API_URL).hostname))
    throw Error("Destino remoto rechazado");
  const sdk = fs.readFileSync(process.argv[3], "utf8");
  const users = {};
  const baselineSales = Number(
    execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_coliseo-supabase-local",
        "psql",
        "-U",
        "postgres",
        "-At",
        "-c",
        "select coalesce(sum(total),0) from orders where status='closed'",
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  for (const role of ["admin", "cashier", "staff"]) {
    const password = crypto.randomBytes(24).toString("base64url"),
      email = role + "-" + crypto.randomUUID() + "@local.test";
    const r = await fetch(state.API_URL + "/auth/v1/admin/users", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + state.SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        role: "authenticated",
      }),
    });
    if (!r.ok) throw Error("No se pudo crear un usuario local");
    const created = await r.json();
    const id = created.id || created.user?.id;
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_coliseo-supabase-local",
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: `update profiles set role='${role}' where id='${id}';`,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    users[role] = { email, password };
  }
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page
    .context()
    .grantPermissions(["local-network-access"], {
      origin: "http://127.0.0.1:4175",
    });
  const errors = [],
    forbidden = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) =>
    d.accept(d.type() === "prompt" ? "Efectivo" : undefined),
  );
  page.on("requestfailed", (r) => {
    if (!r.url().includes("/auth/v1/logout"))
      errors.push(new URL(r.url()).pathname + ":" + r.failure()?.errorText);
  });
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes(".supabase.co")) {
      forbidden.push(url);
      return route.abort();
    }
    if (url.includes("cdn.jsdelivr.net/npm/@supabase/supabase-js"))
      return route.fulfill({
        contentType: "application/javascript",
        body: sdk,
      });
    if (url === "http://127.0.0.1:4175/")
      return route.fulfill({
        contentType: "text/html",
        body: fs
          .readFileSync(path.join(__dirname, "../index.html"), "utf8")
          .replace(
            /const SB_URL="[^"]+";/,
            "const SB_URL=" + JSON.stringify(state.API_URL) + ";",
          )
          .replace(
            /const SB_KEY="[^"]+";/,
            "const SB_KEY=" + JSON.stringify(state.ANON_KEY) + ";",
          ),
      });
    if (url === "http://127.0.0.1:4175/js/management.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: fs.readFileSync(
          path.join(__dirname, "../js/management.js"),
          "utf8",
        ),
      });
    if (url.startsWith(state.API_URL)) return route.continue();
    return route.abort();
  });
  await page.goto("http://127.0.0.1:4175/");
  async function login(role) {
    const signoutError = await page.evaluate(async () => {
      const result = await db.auth.signOut();
      me = null;
      show("login");
      return result.error?.message || null;
    });
    assert.equal(
      signoutError,
      null,
      "La salida debe completarse sin error del SDK",
    );
    await page.fill("#email", users[role].email);
    await page.fill("#password", users[role].password);
    await page.click("#loginBtn");
    try {
      await page
        .locator(
          "#" +
            (role === "admin"
              ? "admin"
              : role === "cashier"
                ? "cashier"
                : "staff") +
            ".on",
        )
        .waitFor();
    } catch {
      throw Error(
        "Inicio local falló: " +
          (await page.locator("#loginMsg").textContent()) +
          "; errores: " +
          errors.join(";"),
      );
    }
  }
  await login("staff");
  await page
    .getByRole("button", { name: "＋ Abrir nueva cuenta", exact: true })
    .click();
  await page.fill("#tableNumber", "30");
  await page
    .locator("#products .product")
    .filter({ hasText: "Pizza de prueba" })
    .click();
  await page.locator("#cart .cartline").waitFor();
  await page
    .getByRole("button", { name: "Guardar cuenta", exact: true })
    .click();
  try {
    await page.locator("#staffOrders .order").waitFor();
  } catch {
    throw Error(
      "Comanda web local: " +
        (await page.locator("#orderMsg").textContent()) +
        "; pantalla=" +
        (await page.locator(".screen.on").getAttribute("id")) +
        "; errores=" +
        errors.join(";"),
    );
  }
  await login("cashier");
  await page.locator("#cashierCashAccessV32").click();
  await page.fill("#fundV31", "100");
  await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await page.locator("#saveMovementV32").waitFor();
  assert.equal(await page.locator("#countedV31").count(), 0);
  await page.evaluate(() => caja());
  await page
    .locator("#cashOrders")
    .getByRole("button", { name: "Cobrar", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .getElementById("cashOrders")
      .textContent.includes("No hay cuentas"),
  );
  await login("admin");
  await page.evaluate(() => openManagement("services"));
  await page.fill("#mg-description", "Internet prueba SDK");
  await page.selectOption("#mg-category", "Internet");
  await page.fill("#mg-amount", "100");
  await page.click("#mg-save");
  await page.getByText("Registro guardado.", { exact: true }).waitFor();
  await page.evaluate(() => openManagement("maintenance"));
  await page.fill("#mg-category", "Revisión");
  await page.fill("#mg-description", "Prueba SDK");
  await page.fill("#mg-amount", "50");
  await page.click("#mg-save");
  await page.getByText("Registro guardado.", { exact: true }).waitFor();
  await page.evaluate(() => openManagement("reservations"));
  await page.fill("#mg-start_time", "18:00");
  await page.fill("#mg-customer_name", "Cliente SDK ficticio");
  await page.fill("#mg-phone", "0000000000");
  await page.click("#mg-save");
  await page.getByText("Registro guardado.", { exact: true }).waitFor();
  await page.evaluate(() => inventario());
  await page.locator("#inventory.on").waitFor();
  await page.evaluate(() => menuAdmin());
  await page
    .locator("#itemList")
    .getByText("Pizza de prueba", { exact: true })
    .waitFor();
  await page.evaluate(() => openCashV31());
  await page.fill("#countedV31", "250");
  await page.fill("#nextFundV31", "100");
  await page.fill("#notesV31", "Prueba cliente SDK");
  await page
    .getByRole("button", { name: "Confirmar cierre definitivo", exact: true })
    .click();
  await page.locator("#fundV31").waitFor();
  await page.evaluate(() => openManagement("finance"));
  assert.ok(
    (await page.locator("#mg-list").textContent()).includes(
      (baselineSales + 150).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(forbidden, []);
  await browser.close();
  console.log(
    "PASS: navegador móvil + supabase-js real + Auth/JWT + PostgREST + PostgreSQL LOCAL: tres roles y flujo de los cinco módulos, menú, comandas, cobro, inventario y caja.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
