const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const history = require("../docs/migration-history.json");
const dir = path.join(__dirname, "../supabase/migrations");
for (const m of history.remote_migrations) {
  const file = path.join(dir, m.version + "_" + m.name + ".sql");
  assert.equal(
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    m.sql_sha256,
    "El histórico debe ser idéntico al remoto",
  );
}
const pending = fs
  .readdirSync(dir)
  .filter(
    (n) =>
      n.endsWith(".sql") &&
      !history.remote_migrations.some(
        (m) => n === m.version + "_" + m.name + ".sql",
      ),
  );
assert.equal(pending.length, 1);
assert.match(pending[0], /_coliseo_operational_safety_v33.sql$/);
console.log(
  "PASS: 15 migraciones históricas idénticas al remoto y solo una migración nueva pendiente.",
);
