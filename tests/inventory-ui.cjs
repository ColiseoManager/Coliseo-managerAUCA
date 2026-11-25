const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const script = source.slice(source.indexOf('let inventoryMoveBusy='), source.indexOf('/* RECETAS CON'));
const elements = new Map();
const el = id => {
  if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', textContent: '', disabled: false, classList: { toggle() {} } });
  return elements.get(id);
};
const bottle = { id: 'bottle', name: 'Botella <prueba>', business: 'EL CLúB', unit: 'ml', display_unit: 'botella', quantity_per_display_unit: 1000, serving_size: 50, current_stock: 2500, minimum_stock: 1000, open_bottle_ml: 500, open_bottle_count: 1, stock_status: 'Disponible', active: true };
const calls = [], notices = [];
let resolveMovement, readFails = false;
const context = {
  document: { addEventListener() {} }, $: el, me: { role: 'admin', active: true },
  inventoryItems: [bottle], recipes: [], movements: [], items: [],
  num: n => String(n), money: n => '$' + n, businessName: n => n, stamp: n => n,
  esc: n => String(n ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  coliseoNotice: n => notices.push(n), coliseoConfirm: async () => true, prompt: () => '1000',
  db: {
    from(table) {
      const q = { select() { return q; }, order() { return q; }, range() { return q; }, limit() { return q; }, then(resolve) { return Promise.resolve(readFails ? { error: { message: 'Lectura fallida' } } : { data: ['inventory_items', 'inventory_status'].includes(table) ? [bottle] : [] }).then(resolve); } };
      return q;
    },
    rpc(name, args) { calls.push({ name, args }); return new Promise(resolve => { resolveMovement = resolve; }); },
  },
};
vm.createContext(context); vm.runInContext(script, context);
function input(type = 'empleado', unit = 'shot', qty = '2') {
  for (const [id, value] of Object.entries({ moveItem: 'bottle', moveType: type, moveUnit: unit, moveQty: qty, employeeBusiness: 'EL CLúB', employeeArea: 'Barra', employeeName: 'Persona de prueba', moveNotes: 'Ensayo', mermaReason: 'Mal estado' })) el(id).value = value;
}
(async () => {
  context.moveTypeUI();
  el('moveItem').value = 'bottle'; context.moveTypeUI();
  assert.match(el('moveQtyLabel').textContent, /1000 ml/);
  assert.doesNotMatch(el('moveQtyLabel').textContent, /750/);
  assert.match(el('moveUnit').innerHTML, /shot/);
  input(); el('employeeName').value = '';
  await context.registrarMovimiento();
  assert.equal(calls.length, 0);
  assert.match(el('moveMsg').textContent, /nombre/);
  input();
  const first = context.registrarMovimiento();
  await context.registrarMovimiento();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_quantity, 100);
  assert.equal(calls[0].args.p_employee_name, 'Persona de prueba');
  assert.equal(calls[0].args.p_employee_area, 'Barra');
  assert.equal(el('inventoryMoveSave').disabled, true);
  resolveMovement({ error: null }); await first;
  assert.match(el('moveMsg').textContent, /Movimiento registrado/);
  assert.equal(el('inventoryMoveSave').disabled, false);
  input('entrada', 'botella', '1.5');
  await context.registrarMovimiento();
  assert.equal(calls.length, 1);
  assert.match(el('moveMsg').textContent, /enteras/);
  input('entrada', 'botella', '2');
  const entry = context.registrarMovimiento();
  assert.equal(calls.at(-1).args.p_quantity, 2000);
  readFails = true; resolveMovement({ error: null }); await entry;
  assert.match(el('moveMsg').textContent, /Movimiento guardado.*recarga/);
  readFails = false; input('entrada', 'ml', 'Infinity');
  await context.registrarMovimiento();
  assert.equal(calls.length, 2);
  context.me.role = 'staff'; input();
  await context.registrarMovimiento();
  assert.equal(calls.length, 2);
  context.me.role = 'admin';
  context.renderInventory();
  assert.match(el('inventoryList').innerHTML, /2 botellas/);
  assert.match(el('inventoryList').innerHTML, /10 shots de 50 ml/);
  assert.match(el('inventoryList').innerHTML, /&lt;prueba&gt;/);
  el('inventoryStatusFilter').value = 'Agotado'; context.renderInventory();
  assert.doesNotMatch(el('inventoryList').innerHTML, /Botella &lt;prueba&gt;/);
  const open = context.abrirBotella('bottle');
  await new Promise(resolve => setImmediate(resolve));
  await context.abrirBotella('bottle');
  assert.equal(calls.filter(c => c.name === 'open_inventory_bottle').length, 1);
  resolveMovement({ error: null }); await open;
  console.log('PASS: employee identity, bottle/shot conversion, finite quantities, duplicate guards, committed-write refresh failure, role access, bottle yields and availability filters.');
})().catch(error => { console.error(error); process.exitCode = 1; });
