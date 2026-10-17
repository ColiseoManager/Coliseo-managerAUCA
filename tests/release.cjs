const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const build = (env) =>
  spawnSync(process.execPath, ["scripts/build-release.cjs"], {
    cwd: root,
    env: { ...process.env, COLISEO_RELEASE_OUTPUT: "", ...env },
    encoding: "utf8",
  });
assert.notEqual(build({ COLISEO_RELEASE_AUTHORIZED: "" }).status, 0);
fs.mkdirSync(path.join(root, "dist/preview/vendor"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/preview/vendor/fake.js"), "ficticio");
fs.writeFileSync(path.join(root, "dist/seed.sql"), "ficticio");
const result = build({ COLISEO_RELEASE_AUTHORIZED: "v33-reviewed" });
assert.equal(result.status, 0, result.stderr);
assert.deepEqual(fs.readdirSync(path.join(root, "dist")).sort(), [
  "index.html",
  "js",
]);
assert.deepEqual(fs.readdirSync(path.join(root, "dist/js")), ["management.js"]);
for (const file of ["index.html", "js/management.js"])
  assert.equal(
    fs.readFileSync(path.join(root, "dist", file), "utf8"),
    fs.readFileSync(path.join(root, file), "utf8"),
  );
const config = require("../vercel.release.json");
assert.equal(config.buildCommand, "npm run build:release");
assert.equal(config.outputDirectory, "dist");
assert.match(
  config.headers[0].headers.find((h) => h.key === "Content-Security-Policy")
    .value,
  /connect-src 'self' https:\/\/vrxkxfsysfnlcuxdsxfx.supabase.co wss:\/\/vrxkxfsysfnlcuxdsxfx.supabase.co;/,
);
console.log(
  "PASS: release protegido, elimina residuos demo, lista cerrada de archivos y Supabase/CSP reales.",
);
