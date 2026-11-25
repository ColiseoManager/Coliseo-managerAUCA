const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
let buttons = [], writes = [], failUpdate = false, confirmations = true;
const el = id => {
  if (!elements.has(id)) elements.set(id, { value: '', checked: false, innerHTML: '', textContent: '', querySelectorAll: () => buttons });
  return elements.get(id);
};
const rows = [
  { id: 'admin', full_name: 'Admin', role: 'admin', active: true },
  { id: 'staff', full_name: '<script>unsafe</script>', role: 'staff', active: true },
  { id: 'client', full_name: 'Cliente', role: 'customer', active: true },
];
const messages = [];
const context = {
  window: {}, me: { id: 'admin', role: 'admin', active: true },
  esc: s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  document: { getElementById: el }, show() {},
  coliseoNotice: message => messages.push(message), coliseoConfirm: async () => confirmations,
  db: { from() {
    let payload, filters = [];
    const q = {
      select() { return q; }, order() { return q; }, range() { return q; },
      eq(key, value) { filters.push(r => r[key] === value); return q; },
      update(data) { payload = data; return q; },
      single() { return Promise.resolve({ data: rows[0], error: null }); },
      then(resolve, reject) {
        const data = rows.filter(r => filters.every(f => f(r)));
        if (payload) {
          if (failUpdate) return Promise.resolve({ data: null, error: { message: 'Permiso denegado' } }).then(resolve, reject);
          writes.push(payload); data.forEach(r => Object.assign(r, payload));
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return q;
  } },
};
vm.runInNewContext(fs.readFileSync(require.resolve('../js/team.js'), 'utf8'), context);
(async () => {
  context.me.role = 'staff';
  await context.window.openTeam();
  assert.match(messages[0], /Solo Administración/);
  context.me.role = 'admin';
  buttons = [{ dataset: { teamSave: '1' }, disabled: false }];
  await context.window.openTeam();
  assert.match(el('teamList').innerHTML, /Tu cuenta actual/);
  assert.doesNotMatch(el('teamList').innerHTML, /<script>|Cliente/);
  assert.match(el('teamList').innerHTML, /&lt;script&gt;/);
  el('teamRole1').value = 'kitchen'; el('teamActive1').checked = true;
  confirmations = false;
  await buttons[0].onclick();
  assert.equal(writes.length, 0);
  confirmations = true; failUpdate = true;
  await buttons[0].onclick();
  assert.match(el('teamMessage').textContent, /Permiso denegado/);
  assert.equal(rows[1].role, 'staff');
  failUpdate = false;
  await buttons[0].onclick();
  assert.equal(rows[1].role, 'kitchen');
  assert.equal(rows[1].active, true);
  assert.match(el('teamMessage').textContent, /Permisos guardados/);
  assert.equal(writes.length, 1);
  console.log('PASS: team authorization, self protection, escaped names, excluded customers, cancellation, denied update and verified role changes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
