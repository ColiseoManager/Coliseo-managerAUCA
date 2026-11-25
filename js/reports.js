/* Consultas administrativas por fecha operativa. No modifica registros. */
(() => {
  'use strict';
  const cents = value => {
    const n = Math.round(Number(value ?? 0) * 100);
    if (!Number.isSafeInteger(n) || n < 0) throw Error('Importe inválido en el reporte.');
    return n;
  };
  const business = value => {
    const name = String(value || '').trim().toLowerCase().replace(/[’']/g, '');
    if (name === 'cuervos pizza') return 'Cuervo’s Pizza';
    if (['el clúb', 'el club'].includes(name)) return 'EL CLúB';
    if (['', 'coliseo', 'coliseo general', 'coliseo food park'].includes(name)) return 'Coliseo Food Park';
    throw Error('Negocio no reconocido: ' + value);
  };
  const payment = method => {
    const name = String(method || '').trim().toLowerCase();
    return name === 'efectivo' ? 'Efectivo' : name === 'tarjeta' ? 'Tarjeta' : name === 'transferencia' ? 'Transferencia' : 'Otros';
  };
  function summarize(orders, splits, payments, items, adjustments = []) {
    const valid = orders.filter(o => !o.is_test);
    const closed = valid.filter(o => o.status === 'closed');
    const byId = new Map(closed.map(o => [o.id, o]));
    const totals = { Efectivo: 0, Tarjeta: 0, Transferencia: 0, Otros: 0 };
    const businesses = new Map(['Cuervo’s Pizza', 'EL CLúB', 'Coliseo Food Park'].map(b => [b, { name: b, cents: 0, accounts: new Set() }]));
    const splitTotals = new Map(), seen = new Set();
    for (const split of splits) {
      if (!byId.has(split.order_id)) continue;
      const name = business(split.business), key = split.order_id + ':' + name;
      if (seen.has(key)) throw Error('Hay un desglose por negocio duplicado.');
      seen.add(key);
      const value = cents(split.net_business), b = businesses.get(name);
      b.cents += value; b.accounts.add(split.order_id);
      splitTotals.set(split.order_id, (splitTotals.get(split.order_id) || 0) + value);
    }
    const mixed = new Map();
    for (const p of payments) {
      if (!mixed.has(p.order_id)) mixed.set(p.order_id, []);
      mixed.get(p.order_id).push(p);
    }
    let sales = 0;
    for (const order of closed) {
      const value = cents(order.total);
      if ((splitTotals.get(order.id) || 0) !== value) throw Error('El desglose por negocio no coincide con una cuenta cobrada.');
      sales += value;
      if (String(order.payment_method).trim().toLowerCase() === 'mixto') {
        const parts = mixed.get(order.id) || [];
        if (parts.reduce((sum, p) => sum + cents(p.amount), 0) !== value) throw Error('El desglose de un cobro mixto no coincide con su total.');
        for (const p of parts) totals[payment(p.method)] += cents(p.amount);
      } else totals[payment(order.payment_method)] += value;
    }
    const courtesyOrders = new Set(), courtesyItems = new Set();
    for (const a of adjustments.filter(a => a.kind === 'complimentary')) {
      if (a.order_item_id) courtesyItems.add(a.order_item_id); else courtesyOrders.add(a.order_id);
    }
    const products = new Map();
    for (const item of items) {
      const order = byId.get(item.order_id);
      if (!order || cents(order.total) === 0 || courtesyOrders.has(order.id) || courtesyItems.has(item.id) || cents(item.unit_price) === 0) continue;
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) throw Error('Cantidad de producto inválida.');
      const name = business(item.business), key = (item.menu_item_id || item.item_name) + ':' + name;
      if (!products.has(key)) products.set(key, { name: item.item_name, business: name, quantity: 0, gross: 0 });
      const product = products.get(key);
      product.quantity += quantity; product.gross += cents(item.unit_price) * quantity;
    }
    return { sales, closed: closed.length, open: valid.filter(o => o.status === 'open').length,
      openTotal: valid.filter(o => o.status === 'open').reduce((sum, o) => sum + cents(o.total), 0), totals,
      businesses: [...businesses.values()].map(b => ({ ...b, accounts: b.accounts.size })),
      products: [...products.values()].sort((a, b) => b.quantity - a.quantity || b.gross - a.gross || a.name.localeCompare(b.name, 'es')) };
  }
  function csv(rows) {
    return '\ufeff' + rows.map(row => row.map(value => {
      let s = String(value ?? '');
      if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
  }
  if (typeof window === 'undefined') { module.exports = { summarize, csv }; return; }
  const el = id => document.getElementById(id);
  let version = 0;
  function admin() { if (me?.role !== 'admin' || !me.active) throw Error('Solo Administración puede consultar reportes.'); }
  function day() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tijuana' }).format(new Date()); }
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) throw Error('Fecha inválida.');
    return value;
  }
  async function pages(table, columns, configure = q => q, key = 'id') {
    const all = [];
    for (let offset = 0; ; offset += 500) {
      let query = configure(db.from(table).select(columns)).order(key);
      if (table === "v_order_business_split") query = query.order("business");
      const { data, error } = await query.range(offset, offset + 499);
      if (error) throw error;
      all.push(...(data || [])); if ((data || []).length < 500) return all;
    }
  }
  async function related(table, ids, columns) {
    const rows = [];
    for (let i = 0; i < ids.length; i += 100) rows.push(...await pages(table, columns, q => q.in('order_id', ids.slice(i, i + 100))));
    return rows;
  }
  function download(rows, name) {
    admin();
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function openReport(mode) {
    try {
      admin();
      const prefix = mode === 'history' ? 'hr' : 'sr', screen = mode === 'history' ? 'history' : 'salesSummary';
      const host = mode === 'history' ? el('historyList') : el('salesSummaryContent');
      show(screen);
      host.innerHTML = '<div class="card"><label for="' + prefix + 'From">Desde</label><input id="' + prefix + 'From" type="date"><label for="' + prefix + 'To">Hasta</label><input id="' + prefix + 'To" type="date"><button class="yellow" id="' + prefix + 'Refresh">Consultar</button></div>'
        + (mode === 'history' ? '<label for="hrSearch">Buscar mesa, plataforma, notas o cuenta</label><input id="hrSearch" type="search"><label for="hrStatus">Estado</label><select id="hrStatus"><option value="">Todos</option><option value="open">Abierta</option><option value="closed">Cerrada</option><option value="cancelled">Cancelada</option></select><label for="hrType">Tipo de pedido</label><select id="hrType"><option value="">Todos</option><option value="table">Mesa</option><option value="takeaway">Para llevar</option><option value="delivery">Delivery</option></select>' : '')
        + '<div id="' + prefix + 'Message" role="status" aria-live="polite"></div><div id="' + prefix + 'Results"></div>';
      el(prefix + 'From').value = day().slice(0, 7) + '-01'; el(prefix + 'To').value = day();
      const refresh = async () => {
        const token = ++version, message = el(prefix + 'Message'), results = el(prefix + 'Results');
        try {
          admin(); results.innerHTML = ''; message.textContent = 'Consultando…';
          if (mode === 'history') ['hrSearch', 'hrStatus', 'hrType'].forEach(id => { el(id).oninput = null; el(id).onchange = null; });
          const from = date(el(prefix + 'From').value), to = date(el(prefix + 'To').value);
          if (from > to) throw Error('La fecha inicial supera la final.');
          const orders = (await pages('orders', '*', q => q.gte('business_date', from).lte('business_date', to))).filter(o => !o.is_test);
          admin(); if (token !== version || !el(screen).classList.contains('on')) return;
          if (mode === 'history') {
            orders.sort((a, b) => String(b.opened_at).localeCompare(String(a.opened_at)) || a.id.localeCompare(b.id));
            const render = () => {
              const search = el('hrSearch').value.trim().toLowerCase(), status = el('hrStatus').value, type = el('hrType').value;
              const selected = orders.filter(o => (!status || status === o.status) && (!type || type === o.order_type) && [orderName(o), o.notes, o.id, o.payment_method].join(' ').toLowerCase().includes(search));
              results.innerHTML = '<p>' + selected.length + ' cuenta(s) en el periodo. Las cuentas de prueba marcadas están excluidas.</p><button class="dark" id="hrExport">Descargar historial CSV</button><div id="hrCards"></div><button class="dark" id="hrMore">Mostrar más cuentas</button>';
              let shown = 0;
              const more = () => {
                const next = selected.slice(shown, shown + 100);
                el('hrCards').insertAdjacentHTML('beforeend', next.map(o => '<article class="order"><div class="row"><b>' + esc(orderName(o)) + '</b><b>' + money(o.total) + '</b></div><div class="muted">' + esc(o.business_date) + ' · ' + esc(({ open: 'Abierta', closed: 'Cerrada', cancelled: 'Cancelada' })[o.status] || o.status) + ' · ' + esc(o.payment_method || 'Sin pago') + '</div><div class="muted">' + esc(o.notes || '') + '</div><button class="dark" data-report-order="' + esc(o.id) + '">Ver cuenta</button></article>').join(''));
                shown += next.length; el('hrMore').hidden = shown >= selected.length;
                el('hrCards').querySelectorAll('[data-report-order]').forEach(button => { button.onclick = () => { try { admin(); detalle(button.dataset.reportOrder); } catch (e) { coliseoNotice(e.message); } }; });
              };
              el('hrMore').onclick = more; more();
              el('hrExport').onclick = () => download([['Cuenta', 'Fecha operativa', 'Pedido', 'Estado', 'Método de pago', 'Total MXN', 'Notas'], ...selected.map(o => [o.id, o.business_date, orderName(o), o.status, o.payment_method, (cents(o.total) / 100).toFixed(2), o.notes])], 'Coliseo_Historial_' + from + '_' + to + '.csv');
            };
            ['hrSearch', 'hrStatus', 'hrType'].forEach(id => { el(id).oninput = render; el(id).onchange = render; });
            render();
          } else {
            const closed = orders.filter(o => o.status === 'closed'), ids = closed.map(o => o.id);
            const [splits, payments, lines, adjustments] = await Promise.all([
              pages('v_order_business_split', '*', q => q.gte('business_date', from).lte('business_date', to), 'order_id'),
              related('order_payments', closed.filter(o => String(o.payment_method).trim().toLowerCase() === 'mixto').map(o => o.id), 'id,order_id,method,amount'),
              related('order_items', ids, 'id,order_id,menu_item_id,item_name,unit_price,quantity,business'),
              related('order_adjustments', ids, 'id,order_id,order_item_id,kind'),
            ]);
            admin(); if (token !== version || !el(screen).classList.contains('on')) return;
            const report = summarize(orders, splits, payments, lines, adjustments);
            const fmt = value => money(value / 100);
            results.innerHTML = '<div class="notice">Fecha operativa de Tijuana. Solo cuentas cobradas; excluye ventas manuales y cuentas marcadas de prueba. Para el consolidado con gastos y ventas manuales consulta Finanzas Globales.</div><div class="summary"><div class="card"><b>Ventas cobradas</b><div class="big">' + fmt(report.sales) + '</div><div>' + report.closed + ' cuenta(s)</div></div><div class="card"><b>Cuentas abiertas</b><div class="big">' + report.open + '</div><div>' + fmt(report.openTotal) + '</div></div></div><button class="dark" id="srExport">Descargar resumen CSV</button><h3>Por negocio</h3>'
              + report.businesses.map(b => '<article class="card"><b>' + esc(b.name) + '</b><div class="amount">' + fmt(b.cents) + '</div><div>' + b.accounts + ' cuenta(s) con productos de este negocio</div></article>').join('')
              + '<h3>Por método de pago</h3>' + Object.entries(report.totals).map(([name, total]) => '<div class="card">' + name + ': <b>' + fmt(total) + '</b></div>').join('')
              + '<h3>Productos más vendidos</h3><p class="muted">Ordenados por unidades en cuentas cobradas. El importe de productos se muestra antes de descuentos. Excluye cortesías identificadas y cuentas totalmente gratuitas.</p><button class="dark" id="srProductsExport">Descargar productos CSV</button>'
              + (report.products.slice(0, 20).map((p, i) => '<div class="card"><b>' + (i + 1) + '. ' + esc(p.name) + '</b><div>' + esc(p.business) + ' · ' + p.quantity + ' unidad(es)</div><div>Antes de descuentos: ' + fmt(p.gross) + '</div></div>').join('') || '<div class="empty">Sin productos vendidos en este periodo.</div>');
            el('srExport').onclick = () => download([['Desde', 'Hasta', 'Concepto', 'Importe MXN'], [from, to, 'Ventas cobradas', (report.sales / 100).toFixed(2)], ...report.businesses.map(b => [from, to, b.name, (b.cents / 100).toFixed(2)]), ...Object.entries(report.totals).map(([name, total]) => [from, to, name, (total / 100).toFixed(2)])], 'Coliseo_Resumen_' + from + '_' + to + '.csv');
            el('srProductsExport').onclick = () => download([['Producto', 'Negocio', 'Unidades', 'Importe antes de descuentos MXN'], ...report.products.map(p => [p.name, p.business, p.quantity, (p.gross / 100).toFixed(2)])], 'Coliseo_Productos_' + from + '_' + to + '.csv');
          }
          message.textContent = '';
        } catch (e) { if (token === version) { results.innerHTML = ''; message.textContent = 'No se pudo generar el reporte: ' + (e.message || String(e)); } }
      };
      el(prefix + 'Refresh').onclick = refresh;
      await refresh();
    } catch (e) { coliseoNotice(e.message || String(e)); }
  }
  window.historial = () => openReport('history');
  window.resumenVentasV21 = () => openReport('summary');
})();
