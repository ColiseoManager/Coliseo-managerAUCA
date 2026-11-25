const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const el = id => {
  if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', textContent: '', classList: { contains: () => true }, insertAdjacentHTML(position, html) { this.innerHTML += html; }, querySelectorAll() { return []; } });
  return elements.get(id);
};
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tijuana' }).format(new Date());
const tables = {
  orders: [{ id: 'one', status: 'closed', total: 55, payment_method: 'Transferencia', business_date: date, order_type: 'takeaway' }],
  v_order_business_split: [{ order_id: 'one', business: 'EL CLúB', net_business: 55, business_date: date }],
  order_items: [{ id: 'line', order_id: 'one', business: 'EL CLúB', item_name: '<Soda>', unit_price: 55, quantity: 1 }],
  order_adjustments: [], order_payments: [],
};
let fail = false, reads = 0;
const notices = [];
const context = {
  window: {}, me: { role: 'admin', active: true }, document: { getElementById: el },
  Intl, Date, show() {}, money: n => '$' + n.toFixed(2), orderName: o => 'Pedido ' + o.id,
  esc: s => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;'), coliseoNotice: s => notices.push(s),
  db: { from(table) {
    let filters = [], start = 0, end = 499;
    const q = { select() { return q; }, order() { return q; }, range(a, b) { start = a; end = b; return q; },
      gte(k, v) { filters.push(r => r[k] >= v); return q; }, lte(k, v) { filters.push(r => r[k] <= v); return q; },
      in(k, values) { filters.push(r => values.includes(r[k])); return q; },
      then(resolve, reject) { reads++; return Promise.resolve(fail ? { error: { message: 'Lectura denegada' } } : { data: (tables[table] || []).filter(r => filters.every(f => f(r))).slice(start, end + 1) }).then(resolve, reject); },
    };
    return q;
  } },
};
vm.runInNewContext(fs.readFileSync(require.resolve('../js/reports.js'), 'utf8'), context);
(async () => {
  context.me.role = 'staff'; await context.window.historial();
  assert.match(notices[0], /Solo Administración/); assert.equal(reads, 0);
  context.me.role = 'admin'; await context.window.resumenVentasV21();
  assert.equal(el('srMessage').textContent, '');
  assert.match(el('srResults').innerHTML, /Transferencia: <b>\$55.00/);
  assert.match(el('srResults').innerHTML, /&lt;Soda&gt;/);
  fail = true; await el('srRefresh').onclick();
  assert.match(el('srMessage').textContent, /Lectura denegada/); assert.equal(el('srResults').innerHTML, '');
  fail = false;
  tables.orders = Array.from({ length: 1001 }, (_, i) => ({ id: String(i).padStart(5, '0'), status: 'open', total: 55, business_date: date, order_type: 'table', opened_at: date }));
  const before = reads; await context.window.historial();
  assert.equal(reads - before, 3);
  assert.match(el('hrResults').innerHTML, /1001 cuenta/);
  assert.equal((el('hrCards').innerHTML.match(/<article/g) || []).length, 100);
  await el('hrMore').onclick();
  assert.equal((el('hrCards').innerHTML.match(/<article/g) || []).length, 200);
  el('hrFrom').value = '2026-02-30'; await el('hrRefresh').onclick();
  assert.match(el('hrMessage').textContent, /Fecha inválida/);
  assert.equal(el('hrSearch').oninput, null);
  console.log('PASS: report screens, role denial, escaped product names, actual data loading, read errors, 1,001-row history pagination and invalid-date handling.');
})().catch(error => { console.error(error); process.exitCode = 1; });
