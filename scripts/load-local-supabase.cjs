// Carga exclusivamente el contenedor local fijo, con datos inventados.
const fs = require("node:fs"),
  path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createSQL } = require("./test-schema.cjs");
const helpers = `create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create or replace function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user::text)$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant execute on all functions in schema auth to anon,authenticated,service_role;
`;
const sql =
  helpers +
  createSQL({ standaloneAuth: false }) +
  fs.readFileSync(path.join(__dirname, "../preview/seed.sql"), "utf8") +
  "create trigger on_auth_user_created_coliseo after insert on auth.users for each row execute function handle_new_user();notify pgrst,'reload schema';";
try {
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_coliseo-supabase-local",
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "pipe", "pipe"] },
  );
  console.log(
    "Estructura, migración V33 y datos ficticios cargados exclusivamente en local.",
  );
} catch {
  console.error(
    "No se pudo cargar el entorno local; comprueba que es una instancia nueva y Auth está iniciado.",
  );
  process.exit(1);
}
