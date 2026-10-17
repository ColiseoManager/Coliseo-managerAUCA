const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("supabase-js"))
      return route.fulfill({
        contentType: "text/javascript",
        body: `
 window.testRows={orders:[],operating_expenses:[],maintenance_expenses:[],reservations:[],cash_sessions_v31:[],cash_movements_v31:[]};window.writes=[];window.failRead=false;
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},from(table){let op='read',payload,filters=[],lo=0,hi=499;const q={select(){return q},order(){return q},range(a,b){lo=a;hi=b;return q},gte(k,v){filters.push(r=>r[k]>=v);return q},lte(k,v){filters.push(r=>r[k]<=v);return q},eq(k,v){filters.push(r=>r[k]===v);return q},limit(){return q},insert(p){op='insert';payload=p;return q},update(p){op='update';payload=p;return q},single(){return q},then(resolve,reject){let data=(window.testRows[table]||[]).filter(r=>filters.every(f=>f(r))).slice(lo,hi+1);if(window.failRead&&op==='read')return Promise.resolve({data:null,error:{message:'Fallo de lectura simulado'}}).then(resolve,reject);if(op!=='read'){window.writes.push({table,op,payload});data={id:'test-id'}}return Promise.resolve({data,error:null}).then(resolve,reject)}};return q},rpc:async()=>({data:null,error:null})})};`,
      });
    if (url === "http://coliseo.test/" || url.endsWith("/index.html"))
      return route.fulfill({
        contentType: "text/html",
        body: fs.readFileSync(path.join(__dirname, "../index.html"), "utf8"),
      });
    if (url === "http://coliseo.test/js/management.js")
      return route.fulfill({
        contentType: "text/javascript",
        body: fs.readFileSync(
          path.join(__dirname, "../js/management.js"),
          "utf8",
        ),
      });
    return route.abort();
  });
  const dialogs = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.accept();
  });
  await page.goto("http://coliseo.test/");
  await page.evaluate(() => {
    me = { role: "admin", active: true };
    show("admin");
  });
  for (const [mode, title] of [
    ["services", "Servicios y pagos"],
    ["maintenance", "Mantenimiento"],
    ["reservations", "Reservaciones"],
    ["finance", "Finanzas globales"],
  ]) {
    await page.evaluate((m) => openManagement(m), mode);
    await page.locator("#management h2").filter({ hasText: title }).waitFor();
    assert.equal(await page.locator("#mg-message").textContent(), "");
  }
  await page.evaluate(() => openManagement("services"));
  await page.fill("#mg-description", "Pago Internet");
  await page.selectOption("#mg-category", "Internet");
  await page.fill("#mg-amount", "1250.50");
  await page.click("#mg-save");
  await page.waitForFunction(() => writes.length === 1);
  assert.equal(await page.evaluate(() => writes[0].payload.amount), 1250.5);
  await page.evaluate(() => openManagement("maintenance"));
  await page.fill("#mg-category", "Electricidad");
  await page.fill("#mg-description", "Reparación");
  await page.fill("#mg-amount", "600");
  await page.click("#mg-save");
  await page.waitForFunction(() => writes.length === 2);
  assert.equal(
    await page.evaluate(() => writes[1].table),
    "maintenance_expenses",
  );
  await page.evaluate(() => openManagement("reservations"));
  await page.fill("#mg-start_time", "18:00");
  await page.fill("#mg-customer_name", "Cliente");
  await page.fill("#mg-phone", "5551234567");
  await page.fill("#mg-agreed_consumption", "1000");
  await page.fill("#mg-deposit", "1500");
  await page.click("#mg-save");
  assert.match(
    await page.locator("#mg-message").textContent(),
    /anticipo supera/,
  );
  assert.equal(await page.evaluate(() => writes.length), 2);
  await page.fill("#mg-deposit", "200");
  await page.click("#mg-save");
  await page.waitForFunction(() => writes.length === 3);
  await page.evaluate(() => {
    const d = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Tijuana",
    }).format(new Date());
    testRows.orders = [
      {
        id: "1",
        business_date: d,
        status: "closed",
        total: 2000,
        payment_method: "Efectivo",
      },
      { id: "2", business_date: d, status: "open", total: 9000 },
    ];
    testRows.operating_expenses = [
      {
        id: "3",
        expense_date: d,
        category: "Internet",
        description: "<img src=x onerror=alert(1)>",
        scope: "Coliseo General",
        amount: 500,
      },
    ];
    testRows.maintenance_expenses = [
      { id: "4", expense_date: d, scope: "Coliseo General", amount: 200 },
    ];
  });
  await page.evaluate(() => openManagement("finance"));
  assert.match(await page.locator("#mg-list").textContent(), /1,300.00/);
  assert.doesNotMatch(await page.locator("#mg-list").textContent(), /9,000.00/);
  await page.evaluate(() => openManagement("services"));
  assert.equal(await page.locator("#mg-list img").count(), 0);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.fill("#mg-description", "Corregido");
  await page.click("#mg-save");
  await page.waitForFunction(() => writes.length === 4);
  assert.equal(await page.evaluate(() => writes[3].op), "update");
  await page.evaluate(() => {
    failRead = true;
  });
  await page.click("#mg-refresh");
  await page.getByText("Fallo de lectura simulado").waitFor();
  await page.evaluate(() => {
    failRead = false;
    me = { role: "cashier" };
  });
  await page.evaluate(() => openManagement("finance"));
  assert.match(dialogs.at(-1), /Solo Administración/);

  await page.evaluate(() => {
    me = { role: "admin", active: true };
    const d = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Tijuana",
    }).format(new Date());
    testRows.cash_sessions_v31 = [
      {
        id: "old",
        business_date: d,
        status: "closed",
        opened_at: d + "T08:00:00Z",
        closed_at: d + "T10:00:00Z",
        opening_fund: 100,
        counted_cash: 300,
        expected_cash: 300,
        next_fund: 100,
      },
      {
        id: "new",
        business_date: d,
        status: "open",
        opened_at: d + "T11:00:00Z",
        opening_fund: 100,
      },
    ];
    testRows.orders = [
      {
        id: "paid-before",
        business_date: d,
        status: "closed",
        closed_at: d + "T09:00:00Z",
        total: 200,
        payment_method: "Efectivo",
      },
      {
        id: "paid-after",
        business_date: d,
        status: "closed",
        closed_at: d + "T12:00:00Z",
        total: 50,
        payment_method: "Efectivo",
      },
    ];
  });
  await page.evaluate(() => openCashV31());
  assert.match(await page.locator("#cashContentV31").textContent(), /150.00/);
  assert.equal(await page.locator("#countedV31").count(), 1);
  await page.evaluate(() => {
    me = { role: "cashier", active: true };
  });
  await page.evaluate(() => openCashV31());
  assert.equal(await page.locator("#countedV31").count(), 0);
  assert.equal(await page.locator("#saveMovementV32").count(), 1);
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  console.log(
    "PASS: cuatro módulos, guardado/edición, validación de anticipos, finanzas, escape HTML, errores, permisos y vista móvil (Supabase simulado).",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
