// Transporte hacia contenedores locales sin exponer tokens en argumentos.
const http = require("node:http");
const { spawn } = require("node:child_process");
const { Duplex } = require("node:stream");
function startProxy(port = 54323) {
  return http
    .createServer((req, res) => {
      const origin = req.headers.origin || "";
      const cors = /^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$/.test(origin)
        ? {
            "access-control-allow-origin": origin,
            "access-control-allow-headers":
              req.headers["access-control-request-headers"] ||
              "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,accept-profile,content-profile,range,range-unit",
            "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
            "access-control-allow-credentials": "true",
          }
        : {};
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        return res.end();
      }
      const auth = req.url.startsWith("/auth/v1/");
      const child = spawn(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_coliseo-supabase-local",
          "nc",
          auth ? "coliseo-test-auth" : "coliseo-test-rest",
          auth ? "9999" : "3000",
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      const socket = Duplex.from({
        readable: child.stdout,
        writable: child.stdin,
      });
      socket.setTimeout = () => socket;
      socket.setNoDelay = () => socket;
      socket.setKeepAlive = () => socket;
      socket.connecting = false;
      const agent = new http.Agent({ keepAlive: false });
      agent.createConnection = () => socket;
      const target = http.request(
        {
          hostname: "localhost",
          port: auth ? 9999 : 3000,
          path: req.url.replace(auth ? "/auth/v1" : "/rest/v1", ""),
          method: req.method,
          headers: { ...req.headers, connection: "close" },
          agent,
        },
        (r) => {
          res.writeHead(r.statusCode, { ...r.headers, ...cors });
          if (r.statusCode === 204 || r.statusCode === 304) {
            r.resume();
            res.end();
          } else r.pipe(res);
        },
      );
      target.on("error", () => {
        if (res.writableEnded) return;
        if (!res.headersSent) res.writeHead(503);
        res.end("Servicio local no disponible");
      });
      req.pipe(target);
    })
    .listen(port, "127.0.0.1", () =>
      console.log("Proxy seguro de pruebas locales preparado."),
    );
}
module.exports = { startProxy };
if (require.main === module) startProxy(Number(process.env.PORT || 54323));
