const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "public");
const port = Number(process.env.PORT || 8080);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...headers
  });
  res.end(body);
}

function resolveFile(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  const clean = path.posix.normalize("/" + decoded).replace(/^\/+/, "");
  const candidate = path.resolve(root, clean);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;

  try {
    const stat = fs.statSync(candidate);
    if (stat.isDirectory()) {
      const index = path.join(candidate, "index.html");
      return fs.existsSync(index) ? index : null;
    }
    if (stat.isFile()) return candidate;
  } catch {}

  if (!path.extname(candidate)) {
    const index = path.join(candidate, "index.html");
    if (fs.existsSync(index)) return index;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();

  if (url.pathname === "/health") {
    return send(res, 200, "ok\n", { "Content-Type": "text/plain; charset=utf-8" });
  }

  if (proto === "http") {
    const targetHost = host === "www.freehotels.info" ? "freehotels.info" : host;
    res.writeHead(301, { Location: `https://${targetHost}${url.pathname}${url.search}` });
    return res.end();
  }

  if (host === "www.freehotels.info") {
    res.writeHead(301, { Location: `https://freehotels.info${url.pathname}${url.search}` });
    return res.end();
  }

  const file = resolveFile(url.pathname);
  if (!file) return send(res, 404, "Not found\n", { "Content-Type": "text/plain; charset=utf-8" });

  const ext = path.extname(file).toLowerCase();
  const headers = {
    "Content-Type": mime[ext] || "application/octet-stream",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Cache-Control": ext === ".html" ? "public, max-age=300" : "public, max-age=86400"
  };

  const stat = fs.statSync(file);
  headers["Content-Length"] = stat.size;

  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`FREEHOTELS_SERVER_OK port=${port}`);
});
