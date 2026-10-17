// Verifica una copia privada en memoria; no tiene acceso de red ni escribe SQL remoto.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  zlib = require("node:zlib");
const { PGlite } = require("@electric-sql/pglite");
const { createSQL } = require("./test-schema.cjs");
const canon = (v) =>
  Array.isArray(v)
    ? v
        .map(canon)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canon(v[k])]),
        )
      : v;
const hash = (v) =>
  crypto
    .createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(canon(v)))
    .digest("hex");
(async () => {
  const file = process.argv[2];
  if (!file) throw Error("Indica el archivo privado de respaldo");
  const bytes = fs.readFileSync(file);
  const b = JSON.parse(bytes);
  const pg = new PGlite();
  await pg.exec(
    createSQL({ source: b.schema, patches: false, foreignKeys: false }),
  );
  // Solo IDs referenciales ficticios para satisfacer FKs. No copia Auth ni sesiones.
  const authIds = new Set();
  for (const c of b.schema.constraints) {
    const match = c.definition.match(
      /^FOREIGN KEY \(([^)]+)\) REFERENCES auth\.users\(id\)/,
    );
    if (match)
      for (const row of b.data[c.table.replace("public.", "")]) {
        const id = row[match[1].replaceAll('"', "")];
        if (id) authIds.add(id);
      }
  }
  for (const id of authIds)
    await pg.query(
      "insert into auth.users(id) values($1) on conflict do nothing",
      [id],
    );
  await pg.exec("set session_replication_role=replica");
  for (const [table, rows] of Object.entries(b.data)) {
    if (rows.length)
      await pg.query(
        `insert into public."${table}" select * from json_populate_recordset(null::public."${table}",$1::json)`,
        [JSON.stringify(rows)],
      );
  }
  await pg.exec("set session_replication_role=origin");
  for (const c of b.schema.constraints.filter((c) =>
    c.definition.startsWith("FOREIGN KEY"),
  ))
    await pg.exec(
      `alter table ${c.table} add constraint "${c.name}" ${c.definition};`,
    );
  const receipts = [];
  for (const [table, rows] of Object.entries(b.data)) {
    const result = await pg.query(
      `select to_jsonb(t) as row from public."${table}" t`,
    );
    const restored = result.rows.map((r) => r.row);
    if (hash(rows) !== hash(restored))
      throw Error("No coincide el contenido restaurado de una tabla");
    receipts.push({ table, rows: rows.length, content_sha256: hash(rows) });
  }
  await pg.close();
  const gzip = zlib.gzipSync(bytes);
  const out = path.dirname(file);
  fs.writeFileSync(path.join(out, "coliseo-manager-backup.json.gz"), gzip, {
    mode: 0o600,
  });
  const manifest = {
    snapshot_at: b.snapshot_at,
    scope: b.scope,
    storage_counts: b.storage_counts,
    tables: receipts,
    total_rows: receipts.reduce((s, r) => s + r.rows, 0),
    migration_count: b.migrations.length,
    restore_verified: true,
    original_json_sha256: hash(bytes.toString()),
    gzip_sha256: crypto.createHash("sha256").update(gzip).digest("hex"),
  };
  fs.writeFileSync(
    path.join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      restore_verified: true,
      tables: receipts.length,
      rows: manifest.total_rows,
      backup_sha256: manifest.gzip_sha256,
    }),
  );
})().catch((e) => {
  console.error(
    "Falló la verificación privada del respaldo; código:",
    e.code || e.name,
  );
  process.exit(1);
});
