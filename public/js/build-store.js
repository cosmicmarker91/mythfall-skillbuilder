// Selected-skill state + URL sharing + community storage.
export class Selection {
  constructor(validIds) { this.valid = validIds; this.set = new Set(); this.name = ""; this.author = ""; this.base = [0, 0, 0, 0, 0, 0]; this.equip = {}; this.listeners = []; this.constrain = (s) => s; }
  onChange(fn) { this.listeners.push(fn); }
  #emit() { this.listeners.forEach((f) => f(this)); }
  toggle(id) { this.set.has(id) ? this.set.delete(id) : this.set.add(id); this.#emit(); }
  replace(ids, name = this.name) { this.set = this.constrain(new Set(ids.filter((i) => this.valid.has(i)))); this.name = name; this.#emit(); }
  clear() { this.set = new Set(); this.#emit(); }
  setBase(base) { this.base = base; this.#emit(); }
  setEquip(equip) { this.equip = equip; this.#emit(); }
  ids() { return [...this.set].sort(); }
}

// Short links:  #v=2&t=<bitmap of owned nodes>&b=<6 stat chars>&e=<2 chars per item>&c=<tree check>&n=name
// t is one bit per node in tree order (188 nodes = 32 characters). c fingerprints the node list so a link made for an
// older tree is detected instead of silently decoding to the wrong skills. Old long links (#s=id1,id2 ...) still load.
let ORDER = [], CHECK = "";
export function setCodec(order) {
  ORDER = order;
  let h = 5381; for (const ch of order.join("|")) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  CHECK = h.toString(36).slice(-4);
}
const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (t) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function writeUrl(sel) {
  const p = new URLSearchParams();
  if (sel.set.size || sel.base.some(Boolean) || Object.keys(sel.equip).length) p.set("v", "2");
  if (sel.set.size) {
    const bytes = new Uint8Array(Math.ceil(ORDER.length / 8));
    ORDER.forEach((id, i) => { if (sel.set.has(id)) bytes[i >> 3] |= 1 << (i & 7); });
    p.set("t", b64(bytes)); p.set("c", CHECK);
  }
  if (sel.base.some(Boolean)) p.set("b", sel.base.map((x) => x.toString(36)).join(""));
  const eq = Object.values(sel.equip).filter(Boolean); if (eq.length) p.set("e", eq.map((id) => id.toString(36).padStart(2, "0")).join(""));
  if (sel.name) p.set("n", sel.name);
  if (sel.author) p.set("a", sel.author);
  const hash = p.toString();
  history.replaceState(null, "", location.pathname + location.search + (hash ? "#" + hash : ""));
  try { localStorage.setItem(LAST, hash); } catch {}   // remember my build for next time I open the site
}
const LAST = "mythfall.lastBuild.v1";
// opening the site with no link restores the build you were last working on
export function restoreLast() {
  if (location.hash.length > 1) return;
  try { const h = localStorage.getItem(LAST); if (h) history.replaceState(null, "", location.pathname + location.search + "#" + h); } catch {}
}
export function readUrl() {
  const p = new URLSearchParams(location.hash.slice(1)), clamp = (x) => Math.max(0, Math.min(20, x || 0));
  if (p.get("v") === "2") {
    let ids = [], stale = false;
    if (p.get("t")) {
      if (p.get("c") !== CHECK) stale = true;
      else { const bytes = unb64(p.get("t")); ids = ORDER.filter((_, i) => bytes[i >> 3] & (1 << (i & 7))); }
    }
    const bs = p.get("b") || "", es = p.get("e") || "";
    return { ids, stale, name: p.get("n") || "", author: p.get("a") || "", base: Array.from({ length: 6 }, (_, i) => clamp(parseInt(bs[i] || "0", 36))),
      equip: (es.match(/.{2}/g) || []).map((x) => parseInt(x, 36)).filter(Boolean) };
  }
  const b = (p.get("b") || "").split(",").map((x) => clamp(parseInt(x, 10)));   // old long format
  return { ids: (p.get("s") || "").split(",").filter(Boolean), stale: false, name: p.get("n") || "", author: p.get("a") || "", base: Array.from({ length: 6 }, (_, i) => b[i] || 0), equip: (p.get("e") || "").split(",").map(Number).filter(Boolean) };
}
export const shareUrl = (sel) => { writeUrl(sel); return location.href; };

// Community: 1) Firebase Firestore REST (works on any static host) if js/config.js is filled in,
// 2) the local server API (server.mjs / Cloudflare function), 3) this browser's localStorage.
import { FIREBASE, ADMIN_EMAIL } from "./config.js";
const LS = "mythfall.community.v1";
const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; } };
const fs = () => FIREBASE.projectId && FIREBASE.apiKey;
const FS = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
const fromDoc = (d) => ({ id: d.name.split("/").pop(), name: d.fields.name.stringValue, skills: (d.fields.skills.arrayValue.values || []).map((v) => v.stringValue), createdAt: d.fields.createdAt.timestampValue, author: d.fields.author ? d.fields.author.stringValue : "",
  base: d.fields.base ? d.fields.base.stringValue.split(",").map(Number) : null, equip: d.fields.equip ? (d.fields.equip.arrayValue.values || []).map((v) => +v.integerValue) : null });
let adminToken = null, adminPass = null, adminExp = 0;   // memory only, never stored
export const community = {
  // Typed admin code = the real password of a Firebase user, so the code is not in the source and the database enforces it.
  async adminLogin(pass) {
    adminPass = pass;
    if (!fs()) { adminToken = "local"; adminExp = Infinity; return true; }   // local server / browser storage: nothing to protect
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: pass, returnSecureToken: true }) });
    if (!r.ok) { adminPass = adminToken = null; return false; }
    const j = await r.json(); adminToken = j.idToken; adminExp = Date.now() + (+j.expiresIn - 60) * 1000; return true;
  },
  adminOff() { adminToken = adminPass = null; },
  isAdmin: () => !!adminToken,
  async remove(id) {
    if (adminToken && Date.now() > adminExp && adminPass) await this.adminLogin(adminPass);   // token lasts ~1h
    if (fs()) {
      const r = await fetch(`${FS()}/builds/${encodeURIComponent(id)}?key=${FIREBASE.apiKey}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error("delete refused");
      return;
    }
    try { const r = await fetch(`api/builds/${encodeURIComponent(id)}`, { method: "DELETE" }); if (r.ok) return; } catch {}
    try { localStorage.setItem(LS, JSON.stringify(lsRead().filter((b) => b.id !== id))); } catch {}
  },
  // admin: change a build's name / author
  async rename(id, { name, author }) {
    if (adminToken && Date.now() > adminExp && adminPass) await this.adminLogin(adminPass);
    if (fs()) {
      const fields = { name: { stringValue: name } }; if (author) fields.author = { stringValue: author };   // a missing author is removed by the mask
      const r = await fetch(`${FS()}/builds/${encodeURIComponent(id)}?key=${FIREBASE.apiKey}&updateMask.fieldPaths=name&updateMask.fieldPaths=author`,
        { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ fields }) });
      if (!r.ok) throw new Error("rename refused");
      return;
    }
    try { const r = await fetch(`api/builds/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, author }) }); if (r.ok) return; } catch {}
    try { localStorage.setItem(LS, JSON.stringify(lsRead().map((b) => (b.id === id ? { ...b, name, author } : b)))); } catch {}
  },
  async list() {
    if (fs()) {
      try {
        const r = await fetch(`${FS()}:runQuery?key=${FIREBASE.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "builds" }], orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }], limit: 100 } }) });
        if (!r.ok) throw 0;
        return { builds: (await r.json()).filter((x) => x.document).map((x) => fromDoc(x.document)), local: false };
      } catch { /* fall through */ }
    }
    try {
      const r = await fetch("api/builds"); if (!r.ok) throw 0;
      return { builds: await r.json(), local: false };
    } catch { return { builds: lsRead().slice().reverse(), local: true }; }
  },
  async publish(name, skills, extra = {}) {   // extra = { base:[6 numbers], equip:[item ids], author }
    if (fs()) {
      try {
        const fields = { name: { stringValue: name }, skills: { arrayValue: { values: skills.map((s) => ({ stringValue: s })) } }, createdAt: { timestampValue: new Date().toISOString() } };
        const full = { ...fields };
        if (extra.author) full.author = { stringValue: extra.author };
        if (extra.base && extra.base.some(Boolean)) full.base = { stringValue: extra.base.join(",") };
        if (extra.equip && extra.equip.length) full.equip = { arrayValue: { values: extra.equip.map((i) => ({ integerValue: String(i) })) } };
        const send = (f) => fetch(`${FS()}/builds?key=${FIREBASE.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: f }) });
        let r = await send(full);
        if (!r.ok && Object.keys(full).length > 3) r = await send(fields);   // rules not updated yet: still publish the skills
        if (!r.ok) throw 0;
        return { build: fromDoc(await r.json()), local: false };
      } catch { /* fall through */ }
    }
    try {
      const r = await fetch("api/builds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, skills, ...extra }) });
      if (!r.ok) throw 0;
      return { build: await r.json(), local: false };
    } catch {
      const build = { id: Math.random().toString(36).slice(2, 10), name, skills, ...extra, createdAt: new Date().toISOString() };
      try { localStorage.setItem(LS, JSON.stringify([...lsRead(), build].slice(-200))); } catch {}
      return { build, local: true };
    }
  },
};
