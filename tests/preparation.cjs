const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const script = [...fs.readFileSync(require.resolve('../index.html'), 'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('let prepStationV35='));
const elements = new Map();
const el = id => {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, { innerHTML: '', textContent: '', value: '', classList: { contains: c => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) } });
  }
  return elements.get(id);
};
const pending = new Map();
const notices = [];
let advanceCount = 0, finishAdvance, routeFails = false;
const settings = { warning_minutes: 5, late_minutes: 10 };
const now = Date.now();
const item = (id, name, status = 'pending') => ({ id, item_name: name, quantity: 1, status, queued_at: new Date(now - 12 * 60000).toISOString(), ready_at: new Date(now - 10 * 60000).toISOString(), order_type: 'table', table_number: '9', price: 999 });
const context = {
  document: { getElementById: el }, me: { role: 'admin', active: true },
  setInterval() {}, Date, console,
  esc: s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'), businessName: s => s,
  coliseoNotice: s => notices.push(s),
  show(id) { ['prepBoardV35', 'prepConfigV35'].forEach(k => el(k).classList.toggle('on', k === id)); },
  db: {
    rpc(name, args) {
      if (name === 'prep_get_settings') return Promise.resolve({ data: settings });
      if (name === 'prep_get_board') return new Promise(resolve => pending.set(args.p_station, resolve));
      if (name === 'prep_advance_ticket') { advanceCount++; return new Promise(resolve => { finishAdvance = resolve; }); }
      if (name === 'prep_update_route') return Promise.resolve(routeFails ? { error: { message: 'Sin conexión' } } : {});
      throw Error('Unexpected RPC: ' + name);
    },
    from() {
      let offset = 0;
      const q = { select() { return q; }, order() { return q; }, range(n) { offset = n; return q; }, then(resolve) { return Promise.resolve({ data: Array.from({ length: Math.min(500, Math.max(0, 1001 - offset)) }, (_, i) => ({ id: offset + i })) }).then(resolve); } };
      return q;
    },
  },
};
vm.createContext(context); vm.runInContext(script, context);
(async () => {
  const kitchen = context.prepOpenV35('kitchen');
  const bar = context.prepOpenV35('bar');
  pending.get('bar')({ data: [item('bar-item', '<Bebida>'), item('ready', 'Lista', 'ready')] });
  await bar;
  const html = el('prepBoardContentV35').innerHTML;
  assert.match(html, /&lt;Bebida&gt;/);
  assert.match(html, /Retrasado/);
  assert.match(html, /Terminado · 2 min/);
  assert.doesNotMatch(html, /999|price|unit_cost/);
  pending.get('kitchen')({ data: [item('kitchen-item', 'Pizza antigua')] });
  await kitchen;
  assert.equal(el('prepBoardContentV35').innerHTML, html);
  const button = {};
  const first = context.prepAdvanceV35('bar-item', 'preparing', button);
  await context.prepAdvanceV35('bar-item', 'preparing', button);
  assert.equal(advanceCount, 1);
  assert.equal(button.disabled, true);
  finishAdvance({ error: { message: 'Transición inválida' } });
  await new Promise(resolve => setImmediate(resolve));
  pending.get('bar')({ data: [] });
  await first;
  assert.equal(button.disabled, false);
  assert.match(notices.at(-1), /Transición inválida/);
  const input = { value: 'kitchen', dataset: { saved: 'bar' } };
  routeFails = true;
  await context.prepSaveRouteV35('bar-item', 'kitchen', input);
  assert.equal(input.value, 'bar');
  assert.equal(input.disabled, false);
  assert.match(notices.at(-1), /Sin conexión/);
  context.me.role = 'kitchen';
  await context.prepOpenV35('bar');
  assert.equal(notices.at(-1), 'No autorizado');
  context.me.active = false;
  await context.prepAdvanceV35('other', 'ready');
  assert.equal(advanceCount, 1);
  const data = await context.prepReadAllV35('menu_items', 'id', 'id');
  assert.equal(data.length, 1001);
  assert.equal(data.at(-1).id, 1000);
  console.log('PASS: station-switch races, threshold alerts, completed duration, escaped output, no prices, duplicate actions, failed saves, role guards and pagination.');
})().catch(error => { console.error(error); process.exitCode = 1; });
