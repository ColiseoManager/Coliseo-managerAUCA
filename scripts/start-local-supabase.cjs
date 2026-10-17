// Infraestructura LOCAL, sin conexiones ni credenciales del proyecto remoto.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const http = require("node:http");
const privateDir =
  process.env.COLISEO_TEST_PRIVATE_DIR ||
  "/workspace/private-backups/coliseo-manager/local";
fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
const run = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const write = (name, value) => {
  const file = path.join(privateDir, name);
  fs.writeFileSync(file, value, { mode: 0o600 });
  return file;
};
(async () => {
  const network = "coliseo-local-test";
  try {
    run(["network", "inspect", network]);
  } catch {
    run(["network", "create", "--internal", network]);
  }
  const password = crypto.randomBytes(24).toString("hex"),
    jwt = crypto.randomBytes(32).toString("hex");
  const env = write("db.env", "POSTGRES_PASSWORD=" + password + "\n");
  run([
    "run",
    "-d",
    "--name",
    "supabase_db_coliseo-supabase-local",
    "--label",
    "coliseo.preview=true",
    "--network",
    network,
    "--network-alias",
    "db",
    "--env-file",
    env,
    "--tmpfs",
    "/var/lib/postgresql/data:rw,size=256m",
    "postgres:17-alpine",
  ]);
  for (let i = 0; i < 60; i++) {
    try {
      run([
        "exec",
        "supabase_db_coliseo-supabase-local",
        "pg_isready",
        "-U",
        "postgres",
      ]);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const sql = `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role authenticator login noinherit password '${password}';grant anon,authenticated,service_role to authenticator;create schema auth;create schema extensions;grant usage on schema public,auth to anon,authenticated,service_role;`;
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
  const auth = write(
    "auth.env",
    `GOTRUE_API_HOST=0.0.0.0\nGOTRUE_API_PORT=9999\nAPI_EXTERNAL_URL=http://127.0.0.1:54323/auth/v1\nGOTRUE_SITE_URL=http://127.0.0.1:4174\nGOTRUE_DB_DRIVER=postgres\nGOTRUE_DB_DATABASE_URL=postgres://postgres:${password}@db:5432/postgres?search_path=auth\nGOTRUE_JWT_SECRET=${jwt}\nGOTRUE_JWT_EXP=3600\nGOTRUE_JWT_AUD=authenticated\nGOTRUE_JWT_DEFAULT_GROUP=authenticated\nGOTRUE_JWT_ADMIN_ROLES=service_role\nGOTRUE_MAILER_AUTOCONFIRM=true\nGOTRUE_DISABLE_SIGNUP=false\n`,
  );
  run([
    "run",
    "-d",
    "--name",
    "coliseo-test-auth",
    "--label",
    "coliseo.preview=true",
    "--network",
    network,
    "--env-file",
    auth,
    "-p",
    "127.0.0.1:54326:9999",
    "public.ecr.aws/supabase/gotrue:v2.197.0",
  ]);
  const rest = write(
    "rest.env",
    `PGRST_DB_URI=postgres://authenticator:${password}@db:5432/postgres\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET=${jwt}\nPGRST_DB_EXTRA_SEARCH_PATH=public,extensions\n`,
  );
  run([
    "run",
    "-d",
    "--name",
    "coliseo-test-rest",
    "--label",
    "coliseo.preview=true",
    "--network",
    network,
    "--env-file",
    rest,
    "-p",
    "127.0.0.1:54327:3000",
    "public.ecr.aws/supabase/postgrest:v16.4",
  ]);
  const token = (role) => {
    const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
    const msg =
      encode({ alg: "HS256", typ: "JWT" }) +
      "." +
      encode({
        role,
        iss: "supabase",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
    return (
      msg +
      "." +
      crypto.createHmac("sha256", jwt).update(msg).digest("base64url")
    );
  };
  write(
    "status.json",
    JSON.stringify({
      API_URL: "http://127.0.0.1:54323",
      ANON_KEY: token("anon"),
      SERVICE_ROLE_KEY: token("service_role"),
    }),
  );
  require("./proxy-local-supabase.cjs").startProxy(54323);
})().catch((e) => {
  console.error(
    "No se pudo preparar la infraestructura local:",
    e.status || e.code || e.name,
  );
  process.exit(1);
});
