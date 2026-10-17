/* Administración sobre las tablas existentes; no crea ni elimina registros relacionados. */
(() => {
  "use strict";
  const scopes = ["Coliseo General", "Cuervos Pizza", "EL CLúB"];
  const categories = [
    "Renta",
    "Agua",
    "Luz",
    "Internet",
    "Música",
    "Televisión",
    "Publicidad",
    "Permisos",
    "Otro",
  ];
  const states = ["Apartado", "Confirmado", "Realizado", "Cancelado"];
  const titles = {
    services: "Servicios y pagos",
    maintenance: "Mantenimiento",
    reservations: "Reservaciones",
    finance: "Finanzas globales",
  };
  const tables = {
    services: "operating_expenses",
    maintenance: "maintenance_expenses",
    reservations: "reservations",
  };
  let mode,
    records = [],
    editing = null,
    loading = 0,
    saving = false;
  const el = (id) => document.getElementById(id);
  const options = (values) =>
    values
      .map((v) => `<option value="${esc(v)}">${esc(businessName(v))}</option>`)
      .join("");
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Tijuana",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  function admin() {
    if (me?.role !== "admin" || me.active === false)
      throw Error("Solo Administración puede acceder a este módulo.");
  }
  function cents(value) {
    const s = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s))
      throw Error("Usa importes no negativos con máximo dos decimales.");
    const n = Math.round(Number(s) * 100);
    if (!Number.isSafeInteger(n) || n > 100000000)
      throw Error("Importe fuera de rango (máximo $1,000,000).");
    return n;
  }
  function date(value) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value + "T12:00:00Z")) ||
      new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value
    )
      throw Error("Fecha inválida.");
    return value;
  }
  const val = (name) => el("mg-" + name).value.trim();
  function field(name, label, type = "text", extra = "") {
    return `<label for="mg-${name}">${label}</label><input id="mg-${name}" name="${name}" type="${type}" ${extra}>`;
  }
  function select(name, label, values) {
    return `<label for="mg-${name}">${label}</label><select id="mg-${name}" name="${name}">${options(values)}</select>`;
  }
  async function rows(table, dateColumn, from, to) {
    const all = [];
    for (let offset = 0; ; offset += 500) {
      let q = db
        .from(table)
        .select("*")
        .order(dateColumn)
        .order("id")
        .range(offset, offset + 499);
      if (from) q = q.gte(dateColumn, from);
      if (to) q = q.lte(dateColumn, to);
      const { data, error } = await q;
      if (error) throw error;
      all.push(...(data || []));
      if ((data || []).length < 500) return all;
    }
  }
  function error(e) {
    el("mg-message").textContent = e.message || String(e);
  }
  function form() {
    editing = null;
    const moneyInput = 'min="0" max="1000000" step="0.01" required';
    let html;
    if (mode === "reservations")
      html =
        field("event_date", "Fecha del evento", "date", "required") +
        field("start_time", "Hora", "time", "required") +
        field(
          "customer_name",
          "Nombre del cliente",
          "text",
          'required maxlength="150"',
        ) +
        field("phone", "Teléfono", "tel", 'required maxlength="40"') +
        field(
          "guest_count",
          "Personas",
          "number",
          'min="1" max="10000" step="1" value="1" required',
        ) +
        field("package_name", "Paquete", "text", 'maxlength="150"') +
        field(
          "agreed_consumption",
          "Consumo acordado (MXN)",
          "number",
          moneyInput + ' value="0"',
        ) +
        field(
          "deposit",
          "Anticipo registrado (MXN)",
          "number",
          moneyInput + ' value="0"',
        ) +
        select("status", "Estado", states);
    else
      html =
        field("expense_date", "Fecha de pago", "date", "required") +
        select("scope", "Negocio", scopes) +
        (mode === "services"
          ? select("category", "Servicio", categories)
          : field(
              "category",
              "Tipo de mantenimiento",
              "text",
              'required maxlength="150"',
            )) +
        field(
          "description",
          "Descripción",
          "text",
          'required maxlength="500"',
        ) +
        field("amount", "Importe pagado (MXN)", "number", moneyInput) +
        (mode === "services"
          ? select("recurrence", "Periodicidad", [
              "Único",
              "Mensual",
              "Anual",
              "Otro",
            ]) + field("renewal_date", "Próximo vencimiento (opcional)", "date")
          : field("supplier", "Proveedor", "text", 'maxlength="150"'));
    el("mg-form").innerHTML =
      `<h3 id="mg-form-title">Nuevo registro</h3>${html}<label for="mg-notes">Notas</label><textarea id="mg-notes" name="notes" maxlength="2000"></textarea><button id="mg-save" class="yellow" type="submit">Guardar</button><button id="mg-reset" class="dark" type="button">Cancelar edición / limpiar</button>`;
    el(
      "mg-" + (mode === "reservations" ? "event_date" : "expense_date"),
    ).value = today();
    el("mg-reset").onclick = form;
  }
  function payload() {
    const p = { notes: val("notes") || null };
    if (mode === "reservations") {
      p.event_date = date(val("event_date"));
      p.start_time = val("start_time");
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(p.start_time))
        throw Error("Indica la hora.");
      for (const k of ["customer_name", "phone", "package_name"])
        p[k] = val(k) || null;
      if (!p.customer_name || !p.phone)
        throw Error("Indica cliente y teléfono.");
      p.guest_count = Number(val("guest_count"));
      if (
        !Number.isInteger(p.guest_count) ||
        p.guest_count < 1 ||
        p.guest_count > 10000
      )
        throw Error("Cantidad de personas inválida.");
      p.agreed_consumption = cents(val("agreed_consumption")) / 100;
      p.deposit = cents(val("deposit")) / 100;
      if (p.deposit > p.agreed_consumption)
        throw Error("El anticipo supera el consumo acordado.");
      p.status = val("status");
      if (!states.includes(p.status)) throw Error("Estado inválido.");
    } else {
      p.expense_date = date(val("expense_date"));
      p.scope = val("scope");
      p.category = val("category");
      p.description = val("description");
      p.amount = cents(val("amount")) / 100;
      if (
        !scopes.includes(p.scope) ||
        !p.category ||
        !p.description ||
        p.amount <= 0
      )
        throw Error(
          "Completa negocio, categoría, descripción e importe positivo.",
        );
      if (mode === "services") {
        if (!categories.includes(p.category)) throw Error("Servicio inválido.");
        p.recurrence = val("recurrence");
        p.renewal_date = val("renewal_date") ? date(val("renewal_date")) : null;
      } else p.supplier = val("supplier") || null;
    }
    return p;
  }
  async function save(event) {
    event.preventDefault();
    const btn = el("mg-save");
    if (btn.disabled || saving) return;
    try {
      admin();
      const p = payload();
      saving = true;
      btn.disabled = true;
      el("mg-message").textContent = "Guardando…";
      let q = editing
        ? db.from(tables[mode]).update(p).eq("id", editing)
        : db.from(tables[mode]).insert(p);
      const { data, error: e } = await q.select("id").single();
      if (e) throw e;
      if (!data) throw Error("No se confirmó el guardado. Revisa permisos.");
      form();
      await refresh();
      el("mg-message").textContent = "Registro guardado.";
    } catch (e) {
      error(e);
    } finally {
      saving = false;
      btn.disabled = false;
    }
  }
  function render() {
    const search = el("mg-search").value.trim().toLowerCase();
    const filtered = records.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(search),
    );
    el("mg-list").innerHTML =
      filtered
        .map(
          (r, i) =>
            `<article class="card"><b>${esc(r.customer_name || r.category)}</b><div>${esc(r.event_date || r.expense_date)} ${esc(r.start_time || "")} · ${esc(r.status || businessName(r.scope))}</div>${mode === "reservations" ? `<div>${esc(r.phone)} · ${esc(r.guest_count)} personas · ${esc(r.package_name || "")}</div><div>Consumo ${money(r.agreed_consumption)} · Anticipo ${money(r.deposit)} · Saldo ${money(Number(r.agreed_consumption) - Number(r.deposit))}</div>` : `<div>${esc(r.description)} · ${money(r.amount)}</div><div>${esc(r.supplier || r.recurrence || "")}${r.renewal_date ? " · Vencimiento " + esc(r.renewal_date) : ""}</div>`}<div class="muted">${esc(r.notes || "")}</div><button class="dark" type="button" data-edit="${i}">Editar</button></article>`,
        )
        .join("") ||
      '<div class="empty">Sin registros para este período.</div>';
    el("mg-list")
      .querySelectorAll("[data-edit]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            admin();
            const r = filtered[Number(b.dataset.edit)];
            form();
            editing = r.id;
            for (const [k, v] of Object.entries(r)) {
              const input = el("mg-" + k);
              if (input) input.value = v ?? "";
            }
            el("mg-form-title").textContent = "Editar registro";
            el("mg-form").scrollIntoView({ behavior: "smooth" });
          }),
      );
  }
  async function finance(from, to, token) {
    const [orders, services, maintenance, movements, sessions] =
      await Promise.all([
        rows("orders", "business_date", from, to),
        rows("operating_expenses", "expense_date", from, to),
        rows("maintenance_expenses", "expense_date", from, to),
        rows("cash_movements_v31", "created_at"),
        rows("cash_sessions_v31", "business_date", from, to),
      ]);
    if (token !== loading) return;
    const closed = orders.filter((r) => r.status === "closed");
    const sum = (rs, key) =>
      rs.reduce((s, r) => s + Math.round(Number(r[key] || 0) * 100), 0) / 100;
    const sales = sum(closed, "total"),
      operating = sum(services, "amount"),
      maint = sum(maintenance, "amount");
    el("mg-list").innerHTML = `<div class="summary">${[
      ["Ventas cobradas", sales],
      ["Servicios pagados", operating],
      ["Mantenimiento pagado", maint],
      ["Ventas menos gastos registrados", sales - operating - maint],
    ]
      .map(
        ([title, value]) =>
          `<div class="card"><div>${title}</div><div class="big">${money(value)}</div></div>`,
      )
      .join(
        "",
      )}</div><div class="notice">Resultado parcial: no incluye costo de mercancía, impuestos ni nómina sin registrar. Los anticipos de reservaciones no se suman a ventas. El fondo, entradas y retiros de caja no son ingresos ni gastos operativos.</div><h3>Ventas por método de pago</h3>${[
      "Efectivo",
      "Tarjeta",
      "Transferencia",
    ]
      .map(
        (p) =>
          `<div class="card">${p}: <b>${money(
            sum(
              closed.filter(
                (r) =>
                  String(r.payment_method).trim().toLowerCase() ===
                  p.toLowerCase(),
              ),
              "total",
            ),
          )}</b></div>`,
      )
      .join("")}<div class="card">Otros métodos: ${money(
      sum(
        closed.filter(
          (r) =>
            !["efectivo", "tarjeta", "transferencia"].includes(
              String(r.payment_method).trim().toLowerCase(),
            ),
        ),
        "total",
      ),
    )}</div><h3>Gastos por negocio</h3>${scopes
      .map(
        (s) =>
          `<div class="card">${esc(businessName(s))}: ${money(
            sum(
              services.filter((r) => r.scope === s),
              "amount",
            ) +
              sum(
                maintenance.filter((r) => r.scope === s),
                "amount",
              ),
          )}</div>`,
      )
      .join("")}<div class="notice">Gastos de caja del intervalo: ${money(
      sum(
        movements.filter(
          (r) =>
            r.kind === "expense" && sessions.some((s) => s.id === r.session_id),
        ),
        "amount",
      ),
    )}. Se presentan por separado: no hay vínculo con servicios o mantenimiento para evitar duplicarlos automáticamente. Los movimientos de caja se agrupan por la fecha operativa de su turno.</div>`;
  }
  async function refresh() {
    const token = ++loading;
    try {
      admin();
      const from = date(el("mg-from").value),
        to = date(el("mg-to").value);
      if (from > to) throw Error("La fecha inicial supera la final.");
      el("mg-message").textContent = "Consultando…";
      el("mg-list").textContent = "";
      if (mode === "finance") await finance(from, to, token);
      else {
        const data = await rows(
          tables[mode],
          mode === "reservations" ? "event_date" : "expense_date",
          from,
          to,
        );
        if (token !== loading) return;
        records = data;
        render();
      }
      if (token === loading) el("mg-message").textContent = "";
    } catch (e) {
      if (token === loading) error(e);
    }
  }
  window.openManagement = async (next) => {
    try {
      admin();
      if (saving) throw Error("Espera a que termine el guardado.");
      if (!titles[next]) return;
      mode = next;
      records = [];
      editing = null;
      let screen = el("management");
      if (!screen) {
        screen = document.createElement("section");
        screen.id = "management";
        screen.className = "screen";
        document.querySelector("main.app").appendChild(screen);
      }
      screen.innerHTML = `<button class="back" onclick="goAdmin()">← Volver</button><div class="brand">COLISEO FOOD PARK</div><h2>${titles[mode]}</h2><div class="card"><label for="mg-from">Desde</label><input id="mg-from" type="date"><label for="mg-to">Hasta</label><input id="mg-to" type="date"><button id="mg-refresh" class="dark">Consultar</button></div><div id="mg-message" role="status" aria-live="polite"></div>${mode === "finance" ? "" : `<div class="notice">${mode === "reservations" ? "El anticipo se registra como referencia; no genera cobro ni movimiento de caja. Cancela cambiando el estado para conservar el historial." : "Registra pagos ya realizados. La periodicidad y el próximo vencimiento son recordatorios; no se generan pagos automáticos ni movimientos de caja."}</div><form id="mg-form" class="card"></form><label for="mg-search">Buscar en el período</label><input id="mg-search" type="search">`}<div id="mg-list"></div>`;
      const d = today();
      el("mg-from").value = d.slice(0, 7) + "-01";
      el("mg-to").value =
        mode === "reservations" ? d.slice(0, 4) + "-12-31" : d;
      el("mg-refresh").onclick = refresh;
      if (mode !== "finance") {
        form();
        el("mg-form").onsubmit = save;
        el("mg-search").oninput = render;
      }
      show("management");
      await refresh();
    } catch (e) {
      alert(e.message);
    }
  };
})();
