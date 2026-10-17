const fs = require("node:fs");
const path = require("node:path");
const { createSQL } = require("./test-schema.cjs");
if (process.env.VERCEL_ENV === "production")
  throw Error(
    "Esta rama es solo de prueba: no se permite un despliegue definitivo.",
  );
const root = path.join(__dirname, ".."),
  out = path.join(root, "dist");
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, "js"), path.join(out, "js"), { recursive: true });
fs.cpSync(path.join(root, "preview"), path.join(out, "preview"), {
  recursive: true,
});
const lib = path.dirname(require.resolve("@electric-sql/pglite"));
fs.mkdirSync(path.join(out, "preview/vendor"), { recursive: true });
for (const f of fs
  .readdirSync(lib)
  .filter(
    (f) => f.endsWith(".js") || f === "pglite.wasm" || f === "pglite.data",
  ))
  fs.copyFileSync(path.join(lib, f), path.join(out, "preview/vendor", f));
fs.writeFileSync(path.join(out, "preview/schema.sql"), createSQL());
let html = fs
  .readFileSync(path.join(root, "index.html"), "utf8")
  .replace(
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
    '<script src="/preview/bootstrap.js"></script>',
  );
html = html
  .replace(/const SB_URL="[^"]+";/, 'const SB_URL="https://prueba.invalid";')
  .replace(/const SB_KEY="[^"]+";/, 'const SB_KEY="preview-local-only";')
  .replace(
    "<title>Coliseo Manager 3.2</title>",
    "<title>Coliseo Manager · Prueba segura</title>",
  );
html = html.replace(
  "</head>",
  '<link rel="stylesheet" href="/preview/preview.css"></head>',
);
fs.writeFileSync(path.join(out, "index.html"), html);
console.log(
  "Vista previa creada: PostgreSQL en el navegador y datos ficticios; sin conexión a Supabase real.",
);
