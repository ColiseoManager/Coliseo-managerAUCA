// Preparación de artefacto real, sin desplegar y sin ejecutar migraciones.
// La habilitación de producción requiere una autorización explícita posterior.
const fs = require("node:fs"),
  path = require("node:path");
if (process.env.COLISEO_RELEASE_AUTHORIZED !== "v33-reviewed")
  throw Error("Falta autorización final para habilitar el build real.");
const root = path.join(__dirname, ".."),
  out = process.env.COLISEO_RELEASE_OUTPUT || path.join(root, "dist");
fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
if (
  html.includes("preview/bootstrap.js") ||
  html.includes("preview-local-only")
)
  throw Error("El código real contiene el adaptador de demostración");
fs.writeFileSync(path.join(out, "index.html"), html);
fs.cpSync(path.join(root, "js"), path.join(out, "js"), { recursive: true });
console.log(
  "Artefacto de operación real preparado. Este comando no publica ni modifica Supabase.",
);
