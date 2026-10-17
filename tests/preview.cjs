const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [],
    remote = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/supabase\.co/.test(r.url())) remote.push(r.url());
  });
  const dialogs = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.accept(d.type() === "prompt" ? "Efectivo" : undefined);
  });
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173/");
  await page
    .locator("#preview-banner button[data-role=admin]")
    .waitFor({ timeout: 60000 });
  await page.waitForFunction(
    () => !document.querySelector("#preview-banner button").disabled,
    { timeout: 60000 },
  );
  const role = async (name) => {
    await page.locator(`#preview-banner button[data-role=${name}]`).click();
    await page.waitForFunction(
      () => !document.querySelector("#preview-banner button").disabled,
    );
    assert.equal(
      await page.locator(".screen.on").getAttribute("id"),
      name === "admin" ? "admin" : name === "cashier" ? "cashier" : "staff",
    );
  };
  await role("admin");
  await page.locator("[onclick=\"openManagement('services')\"]").click();
  await page.fill("#mg-description", "Internet de prueba");
  await page.selectOption("#mg-category", "Internet");
  await page.fill("#mg-amount", "100");
  await page.click("#mg-save");
  await page.getByText("Registro guardado.", { exact: true }).waitFor();
  await page
    .locator("#mg-list")
    .getByText("Internet de prueba", { exact: false })
    .waitFor();
  await page.evaluate(() => goAdmin());
  await page.locator("[onclick=\"openManagement('maintenance')\"]").click();
  await page.fill("#mg-category", "Reparación");
  await page.fill("#mg-description", "Revisión de prueba");
  await page.fill("#mg-amount", "50");
  await page.click("#mg-save");
  await page.getByText("Registro guardado.", { exact: true }).waitFor();
  await page.evaluate(() => goAdmin());
  await page.locator("[onclick=\"openManagement('reservations')\"]").click();
  await page.fill("#mg-start_time", "18:00");
  await page.fill("#mg-customer_name", "Cliente de prueba");
  await page.fill("#mg-phone", "0000000000");
  await page.fill("#mg-agreed_consumption", "1000");
  await page.fill("#mg-deposit", "200");
  await page.click("#mg-save");
  await page.getByText("Registro guardado.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.selectOption("#mg-status", "Cancelado");
  await page.click("#mg-save");
  await page.getByText("Registro guardado.", { exact: true }).waitFor();
  assert.match(await page.locator("#mg-list").textContent(), /Cancelado/);
  await role("cashier");
  await page.locator("#cashierCashAccessV32").click();
  await page.fill("#fundV31", "100");
  await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await page.locator("#saveMovementV32").waitFor();
  assert.equal(await page.locator("#countedV31").count(), 0);
  await role("staff");
  await page
    .getByRole("button", { name: "＋ Abrir nueva cuenta", exact: true })
    .click();
  await page.fill("#tableNumber", "12");
  await page
    .locator("#products .product")
    .filter({ hasText: "Pizza de prueba" })
    .click();
  await page
    .locator("#products .product")
    .filter({ hasText: "Bebida de prueba" })
    .click();
  await page
    .getByRole("button", { name: "Guardar cuenta", exact: true })
    .click();
  await page.locator("#staffOrders .order").waitFor();
  const staffCount = await page.evaluate(async () => {
    const r = await db.from("inventory_items").select("id");
    return r.data?.length;
  });
  assert.equal(staffCount, 0);
  const beforeDialog = dialogs.length;
  await page.evaluate(() => openManagement("finance"));
  assert.match(dialogs[beforeDialog], /Solo Administración/);
  await role("cashier");
  await page
    .locator("#cashOrders")
    .getByRole("button", { name: "Cobrar", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .getElementById("cashOrders")
      .textContent.includes("No hay cuentas"),
  );
  await role("admin");
  await page.evaluate(() => inventario());
  await page.locator("#inventory").waitFor({ state: "visible" });
  const stock = await page.evaluate(async () => {
    const r = await db
      .from("inventory_items")
      .select("current_stock")
      .eq("id", "30000000-0000-4000-8000-000000000001")
      .single();
    return Number(r.data.current_stock);
  });
  assert.equal(stock, 49);
  await page.evaluate(() => menuAdmin());
  await page
    .locator("#itemList")
    .getByText("Pizza de prueba", { exact: true })
    .waitFor();
  await page.evaluate(() => openCashV31());
  await page.fill("#countedV31", "300");
  await page.fill("#nextFundV31", "100");
  await page.fill("#notesV31", "Sin incidencias");
  await page
    .getByRole("button", { name: "Confirmar cierre definitivo", exact: true })
    .click();
  await page.locator("#fundV31").waitFor();
  assert.ok(dialogs.some((d) => d.includes("Cierre guardado correctamente")));
  await page.evaluate(() => openManagement("finance"));
  assert.match(await page.locator("#mg-list").textContent(), /200.00/);
  await page.screenshot({
    path:
      process.env.PREVIEW_SCREENSHOT ||
      "/workspace/scratch/coliseo-mobile-preview.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(remote, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: navegador móvil sobre PostgreSQL aislado: los cinco módulos, tres roles, comanda, cobro, inventario, menú, reservación cancelada, finanzas y corte de caja; cero peticiones a Supabase real.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
