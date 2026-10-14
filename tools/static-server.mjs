// Serveur statique sans dépendance pour le panel et l'app chauffeur (web).
// Usage : node tools/static-server.mjs <dossier>   (PORT, défaut 3000)
// - renvoie index.html pour les routes de l'app (SPA)
// - écrit /env.js à partir des variables PUBLIC_* pour configurer l'URL de l'API au démarrage
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "dist");
const port = Number(process.env.PORT ?? 3000);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json", ".map": "application/json",
};
const publicEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("PUBLIC_")));
const envJs = `window.__ENV__=${JSON.stringify(publicEnv)};`;

function send(res, file, status = 200) {
  const ext = path.extname(file);
  const immutable = file.includes(`${path.sep}assets${path.sep}`) || file.includes(`${path.sep}_expo${path.sep}static${path.sep}`);
  res.writeHead(status, {
    "Content-Type": types[ext] ?? "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/healthz") return res.end("ok");
    if (url.pathname === "/env.js") {
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
      return res.end(envJs);
    }
    const target = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!target.startsWith(root)) {
      res.writeHead(400);
      return res.end();
    }
    const candidates = [target, `${target}.html`, path.join(target, "index.html")];
    const found = candidates.find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
    if (found) return send(res, found);
    // Routes dynamiques exportées par Expo (ex. /stop/123 -> stop/[id].html).
    const dir = path.dirname(target);
    if (dir.startsWith(root) && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      const dyn = fs.readdirSync(dir).find((f) => /^\[[^\]]+\]\.html$/.test(f));
      if (dyn) return send(res, path.join(dir, dyn));
    }
    if (path.extname(url.pathname)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    send(res, path.join(root, "index.html"));
  })
  .listen(port, "0.0.0.0", () => console.log(`static ${root} on :${port}`));
