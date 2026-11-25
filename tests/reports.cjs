const assert = require('node:assert/strict');
const { summarize, csv } = require('../js/reports.js');
const orders = [
  { id: 'mixed', status: 'closed', total: '275.00', payment_method: ' Mixto ' },
  { id: 'discount', status: 'closed', total: '49.50', payment_method: 'Tarjeta' },
  { id: 'zero', status: 'closed', total: 0, payment_method: 'Otro' },
  { id: 'open', status: 'open', total: 55 },
  { id: 'test', status: 'closed', total: 9000, is_test: true, payment_method: 'Efectivo' },
];
const splits = [
  { order_id: 'mixed', business: 'Cuervos Pizza', net_business: 220 },
  { order_id: 'mixed', business: 'EL CLúB', net_business: 55 },
  { order_id: 'discount', business: 'EL CLUB', net_business: 49.5 },
  { order_id: 'test', business: 'EL CLúB', net_business: 9000 },
];
const payments = [{ order_id: 'mixed', method: 'Efectivo', amount: 100 }, { order_id: 'mixed', method: 'Tarjeta', amount: 175 }];
const lines = [
  { id: 'pizza', order_id: 'mixed', menu_item_id: 'p', item_name: 'Pizza', business: 'Cuervo’s Pizza', unit_price: 220, quantity: 1 },
  { id: 'soda', order_id: 'mixed', menu_item_id: 's', item_name: 'Soda', business: 'EL CLúB', unit_price: 55, quantity: 1 },
  { id: 'soda2', order_id: 'discount', menu_item_id: 's', item_name: 'Soda', business: 'EL CLúB', unit_price: 55, quantity: 1 },
  { id: 'courtesy', order_id: 'mixed', menu_item_id: 'gift', item_name: 'Regalo', business: 'EL CLúB', unit_price: 55, quantity: 1 },
  { id: 'zero-item', order_id: 'zero', item_name: 'Gratis', business: 'EL CLúB', unit_price: 55, quantity: 1 },
  { id: 'open-item', order_id: 'open', item_name: 'Pendiente', business: 'EL CLúB', unit_price: 55, quantity: 99 },
  { id: 'test-item', order_id: 'test', item_name: 'Ensayo', business: 'EL CLúB', unit_price: 55, quantity: 999 },
];
const report = summarize(orders, splits, payments, lines, [{ order_item_id: 'courtesy', kind: 'complimentary' }]);
assert.equal(report.sales, 32450);
assert.equal(report.closed, 3);
assert.equal(report.open, 1);
assert.equal(report.openTotal, 5500);
assert.deepEqual(report.totals, { Efectivo: 10000, Tarjeta: 22450, Transferencia: 0, Otros: 0 });
assert.equal(report.businesses[0].cents, 22000);
assert.equal(report.businesses[1].cents, 10450);
assert.equal(report.businesses[1].accounts, 2);
assert.equal(report.products[0].name, 'Soda');
assert.equal(report.products[0].quantity, 2);
assert.equal(report.products[0].gross, 11000);
assert.equal(report.products.length, 2);
assert.throws(() => summarize(orders, splits, [{ order_id: 'mixed', method: 'Tarjeta', amount: 274 }], []), /mixto/);
assert.throws(() => summarize(orders, splits.slice(1), payments, []), /negocio/);
assert.throws(() => summarize(orders, [...splits, splits[0]], payments, []), /duplicado/);
assert.throws(() => summarize([{ id: 'x', status: 'closed', total: NaN }], [], [], []), /inválido/);
assert.equal(summarize([], [], [], []).sales, 0);
const text = csv([['Nombre', 'Notas'], ['=HYPERLINK("bad")', 'línea\ncon "comillas"'], ['\t+SUM(1)', 'Normal']]);
assert.ok(text.startsWith('\ufeff'));
assert.match(text, /"'=HYPERLINK/);
assert.match(text, /"'\t\+SUM/);
assert.match(text, /""comillas""/);
console.log('PASS: report reconciliation, mixed payments, business aliases, product ranking, exclusions, discount gross/net separation, invalid totals and CSV formula protection.');
