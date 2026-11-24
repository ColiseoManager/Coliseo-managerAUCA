const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the actual management screen with deterministic, paginated reads.
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', textContent: '' });
  return elements.get(id);
};
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tijuana' }).format(new Date());
const tables = {
  orders: [
    { id: 'paid', business_date: date, status: 'closed', total: 200, payment_method: 'Mixto' },
    { id: 'open', business_date: date, status: 'open', total: 9000 },
    { id: 'test', business_date: date, status: 'closed', total: 8000, is_test: true },
  ],
  v_order_business_split: [
    { order_id: 'paid', business_date: date, business: 'Cuervo’s Pizza', net_business: 150 },
    { order_id: 'paid', business_date: date, business: 'EL CLUB', net_business: 50 },
    { order_id: 'test', business_date: date, business: 'EL CLúB', net_business: 8000 },
  ],
  order_payments: [{ id: 'p1', order_id: 'paid', method: 'Tarjeta', amount: 120 }, { id: 'p2', order_id: 'paid', method: 'Transferencia', amount: 80 }],
  sales: [{ id: 'manual', business_date: date, business: 'EL CLúB', amount: 25, payment_method: 'Efectivo' }],
  expenses: [{ id: 'purchase', expense_date: date, business: 'Cuervos Pizza', amount: 30 }],
  operating_expenses: [{ id: 'service', expense_date: date, scope: 'Coliseo General', amount: 100 }],
  maintenance_expenses: [{ id: 'repair', expense_date: date, scope: 'EL CLúB', amount: 10 }],
  cash_sessions_v31: [{ id: 'session', business_date: date }],
  cash_movements_v31: [{ id: 'cash', session_id: 'session', kind: 'expense', amount: 500 }],
};
const context = {
  Intl, Date, console, me: { role: 'admin', active: true }, window: {},
  document: { getElementById: element }, show() {}, alert(message) { throw Error(message); },
  esc: value => String(value), businessName: value => value === 'Cuervos Pizza' ? 'Cuervo’s Pizza' : value,
  money: value => '$' + Number(value).toFixed(2),
  db: { from(table) {
    let filters = [], lo = 0, hi = 499;
    const q = {
      select() { return q; },
      order(column) {
        if (table === 'v_order_business_split') assert.notEqual(column, 'id');
        return q;
      },
      range(a, b) { lo = a; hi = b; return q; },
      gte(k, v) { filters.push(r => r[k] >= v); return q; },
      lte(k, v) { filters.push(r => r[k] <= v); return q; },
      then(resolve, reject) { return Promise.resolve({ data: (tables[table] || []).filter(r => filters.every(f => f(r))).slice(lo, hi + 1), error: null }).then(resolve, reject); },
    };
    return q;
  } },
};
vm.runInNewContext(fs.readFileSync(require.resolve('../js/management.js'), 'utf8'), context);
(async () => {
  await context.window.openManagement('finance');
  assert.equal(element('mg-message').textContent, '');
  const html = element('mg-list').innerHTML;
  assert.match(html, /Cuervo’s Pizza<\/h4><div>Ventas \$150.00<\/div><div>Gastos \$30.00<\/div><div>Saldo \$120.00/);
  assert.match(html, /EL CLúB<\/h4><div>Ventas \$75.00<\/div><div>Gastos \$10.00<\/div><div>Saldo \$65.00/);
  assert.match(html, /Coliseo Food Park<\/h4><div>Ventas \$0.00<\/div><div>Gastos \$100.00<\/div><div>Saldo \$-100.00/);
  assert.match(html, /Ventas menos gastos registrados<\/div><div class="big">\$85.00/);
  assert.match(html, /Efectivo: <b>\$25.00/);
  assert.match(html, /Tarjeta: <b>\$120.00/);
  assert.match(html, /Transferencia: <b>\$80.00/);
  assert.doesNotMatch(html, /8000|9000/);
  tables.v_order_business_split[0].net_business = 149;
  await element('mg-refresh').onclick();
  assert.match(element('mg-message').textContent, /no coincide/);
  console.log('PASS: finance business allocation, manual sales, purchases, mixed methods, excluded test/open orders, separate cash expenses and inconsistent totals.');
})().catch(error => { console.error(error); process.exitCode = 1; });
