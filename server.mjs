// Tiny local server: serves /public and a file-backed community API (data/community.json).
// No database. Run: node server.mjs   (PORT env var optional)
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(root, "public");
const store = path.join(root, "data", "community.json");
const port = Number(process.env.PORT) || 5173;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };

const readBuilds = async () => { try { return JSON.parse(await fs.readFile(store, "utf8")); } catch { return []; } };
const send = (res, code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };

async function readBody(req, limit = 100_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error("too large"); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/builds") {
      if (req.method === "GET") return send(res, 200, (await readBuilds()).slice(-200).reverse());
      if (req.method === "POST") {
        const b = await readBody(req);
        const name = String(b.name || "").trim().slice(0, 40);
        const skills = Array.isArray(b.skills) ? b.skills.filter((s) => typeof s === "string" && s.length <= 64).slice(0, 500) : null;
        if (!name || !skills || !skills.length) return send(res, 400, { error: "name and skills required" });
        const base = Array.isArray(b.base) && b.base.length === 6 ? b.base.map((x) => Math.max(0, Math.min(20, Math.trunc(+x) || 0))) : null;
        const equip = Array.isArray(b.equip) ? b.equip.map(Number).filter(Number.isInteger).slice(0, 12) : null;
        const author = String(b.author || "").trim().slice(0, 30);
        const build = { id: crypto.randomBytes(5).toString("hex"), name, skills, base, equip, author, createdAt: new Date().toISOString() };
        const all = await readBuilds(); all.push(build);
        await fs.mkdir(path.dirname(store), { recursive: true });
        await fs.writeFile(store, JSON.stringify(all.slice(-1000), null, 1));
        return send(res, 201, build);
      }
      return send(res, 405, { error: "method not allowed" });
    }
    const del = url.pathname.match(/^\/api\/builds\/([\w-]+)$/);
    if (del && req.method === "PATCH") {
      const b = await readBody(req);
      const name = String(b.name || "").trim().slice(0, 40), author = String(b.author || "").trim().slice(0, 30);
      if (!name) return send(res, 400, { error: "name required" });
      const all = (await readBuilds()).map((x) => (x.id === del[1] ? { ...x, name, author } : x));
      await fs.writeFile(store, JSON.stringify(all, null, 1));
      return send(res, 200, { ok: true });
    }
    if (del && req.method === "DELETE") {
      const all = (await readBuilds()).filter((b) => b.id !== del[1]);
      await fs.writeFile(store, JSON.stringify(all, null, 1));
      return send(res, 200, { ok: true });
    }
    let rel = decodeURIComponent(url.pathname); if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(pub, rel));
    if (!file.startsWith(pub + path.sep)) return send(res, 403, "forbidden", "text/plain");
    const data = await fs.readFile(file);
    send(res, 200, data, types[path.extname(file)] || "application/octet-stream");
  } catch (e) { send(res, e.code === "ENOENT" ? 404 : 500, "not found", "text/plain"); }
}).listen(port, "127.0.0.1", () => console.log(`Mythfall planner: http://localhost:${port}`));
