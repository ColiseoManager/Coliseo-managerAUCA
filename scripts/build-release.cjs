// Solo prepara archivos: no despliega ni ejecuta migraciones.
const fs = require("node:fs");
const path = require("node:path");
if (process.env.COLISEO_RELEASE_AUTHORIZED !== "v33-reviewed")
  throw Error(
    "Falta habilitación explícita del build real. No implica autorización de despliegue.",
  );
const root = path.resolve(__dirname, "..");
const out = path.join(root, "dist");
if (process.env.COLISEO_RELEASE_OUTPUT)
  throw Error(
    "El build real utiliza exclusivamente dist para evitar destinos inseguros.",
  );
const files = ["index.html", "js/management.js", "manifest.webmanifest", "sw.js", "icons/icon.svg"];
const sources = files.map((file) => [
  file,
  fs.readFileSync(path.join(root, file), "utf8"),
]);
for (const [file, content] of sources) {
  if (
    /preview\/|preview-local-only|prueba\.invalid|PGlite|seed\.sql|service_role|sb_secret_/.test(
      content,
    )
  )
    throw Error(`Contenido de prueba o credencial privada en ${file}`);
}
if (!sources[0][1].includes("https://vrxkxfsysfnlcuxdsxfx.supabase.co"))
  throw Error("Proyecto Supabase real inesperado");
if (fs.existsSync(out) && fs.lstatSync(out).isSymbolicLink())
  throw Error("dist no puede ser un enlace simbólico");
const staging = fs.mkdtempSync(path.join(root, ".release-build-"));
try {
  for (const [file, content] of sources) {
    const dest = path.join(staging, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  // Destino fijo y lista explícita: elimina cualquier residuo del build de prueba.
  fs.rmSync(out, { recursive: true, force: true });
  fs.renameSync(staging, out);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
console.log(
  "Artefacto real preparado: solo index.html y js/management.js. Sin publicación ni cambios en Supabase.",
);
