const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../dist");
const headers = require("../vercel.json").headers[0].headers;
http
  .createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : decodeURIComponent(pathname)),
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    for (const h of headers) res.setHeader(h.key, h.value);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".wasm": "application/wasm",
        ".css": "text/css",
        ".sql": "text/plain",
      }[path.extname(file)] || "application/octet-stream",
    );
    fs.readFile(file, (e, data) => {
      res.writeHead(e ? 404 : 200);
      res.end(e ? "No encontrado" : data);
    });
  })
  .listen(Number(process.env.PORT || 4174), "127.0.0.1", () =>
    console.log("Vista previa local con la misma CSP de Vercel."),
  );
