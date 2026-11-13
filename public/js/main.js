import { loadTree } from "./tree-source.js";
import { Graph, MAX_POINTS } from "./graph.js";
import { buildWorld } from "./world.js";
import { Viewport } from "./viewport.js";
import { Selection, writeUrl, readUrl, shareUrl, community, setCodec, restoreLast } from "./build-store.js";
import { initCharacter } from "./character.js";
import { computeStats, liveLine } from "./stats.js";
import { loadItems, SLOT_KEYS } from "./items.js";
import { initPicker } from "./picker.js";

const $ = (id) => document.getElementById(id);
let toastTimer;
function toast(msg, action) {
  const t = $("toast"); t.replaceChildren(msg);
  if (action) { const b = document.createElement("button"); b.textContent = action.label; b.onclick = () => { action.fn(); t.classList.remove("show"); }; t.append(b); }
  t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), action ? 6000 : 2500);
}

const tree = await loadTree();
const data = await loadItems();
let statInfo = {}; try { statInfo = await (await fetch("data/stats.json")).json(); } catch {}   // stat descriptions for the hover cards
let effectInfo = {}; try { effectInfo = await (await fetch("data/effects.json")).json(); } catch {}   // status effect tiers (DPS test)
const graph = new Graph(tree);
setCodec(tree.nodes.map((n) => n.id));
const sel = new Selection(new Set(tree.nodes.map((n) => n.id)));   // sel.set = the nodes you have purchased
sel.constrain = (set) => graph.normalize(set);   // one starting node, connected, max 28 points: also applies to links and community builds
let pinned = null, hover = null;   // pinned = the node you clicked (shows a tick; click it again to buy)

const TYPE = { start: "Starting Node", keystone: "Keystone", notable: "Notable", travel: "Travel Node" };
const target = () => hover || pinned || "nomad";

const world = buildWorld($("world"), tree, { onHover: (id) => { hover = id; render(); } });

function renderPanel(id, plan) {   // (plan may be reassigned below)
  const n = graph.nodes.get(id), owned = sel.set.has(id);
  const stats = computeStats([...sel.set].map((i) => graph.nodes.get(i)).filter(Boolean), sel.base, Object.values(sel.equip).map((i) => data.byId.get(i)).filter(Boolean));
  $("pIcon").src = n.icon; $("pIcon").parentElement.className = "p-icon " + n.kind;
  $("pName").textContent = n.name; $("pType").textContent = TYPE[n.kind];
  $("pEffects").replaceChildren(...n.effect.map((t) => { const d = document.createElement("div"); d.textContent = liveLine(t, stats); return d; }));
  const btn = $("pBtn"); btn.classList.toggle("refund", owned); btn.disabled = false;
  const otherStart = n.kind === "start" && !owned && graph.ownedStart(sel.set);
  if (owned) { $("pCost").textContent = "Purchased"; btn.textContent = "Refund"; }
  else if (otherStart) { $("pCost").textContent = "You can only pick one starting node"; btn.textContent = "Cannot Reach"; btn.disabled = true; plan = null; }
  else if (!plan) { $("pCost").textContent = "No path from a starting node"; btn.textContent = "Cannot Reach"; btn.disabled = true; }
  else if (plan.cost === 1) { $("pCost").textContent = "Skillpoint Cost: 1"; btn.textContent = "Purchase"; }
  else { $("pCost").textContent = `Path Cost: ${plan.cost} skillpoints`; btn.textContent = "Cannot Reach"; btn.disabled = true; } // like the game: only a node next to one you own (or a starting node) can be bought
  const pp = $("pPath"); pp.hidden = !(plan && plan.cost > 1); pp.textContent = plan ? `Purchase the whole path (${plan.cost} skillpoints)` : "";
}

function render() {
  const id = target(), plan = sel.set.has(id) ? null : graph.plan(id, sel.set);
  world.render({ owned: sel.set, avail: graph.available(sel.set), plan, hover, pinned });
  renderPanel(id, plan);
  $("count").textContent = sel.set.size;
  const nameEl = $("buildName"); if (document.activeElement !== nameEl) nameEl.value = sel.name;
  const authEl = $("buildAuthor"); if (document.activeElement !== authEl) authEl.value = sel.author;
}
let picker;
const character = initCharacter(sel, { $, graph, data, info: statInfo, effects: effectInfo, openPicker: (t) => picker.open(t) });
picker = initPicker({ $, data, sel, getStats: () => character.stats() });
sel.onChange(() => { render(); character.render(); writeUrl(sel); });

function purchase(id, wholePath = false) {
  const plan = graph.plan(id, sel.set);
  if (!plan) return toast(graph.nodes.get(id).kind === "start" && graph.ownedStart(sel.set) ? "You can only pick one starting node" : "Cannot reach that node: paths can't run through keystones");
  if (plan.cost > MAX_POINTS - sel.set.size) return toast(`The maximum skill points is ${MAX_POINTS}`);
  if (plan.cost > 1 && !wholePath) return toast(`Cannot reach yet. It needs ${plan.cost} skillpoints along the path`);
  sel.replace([...sel.set, ...plan.path]);
}
function refund(id) {
  const next = new Set(sel.set); next.delete(id);
  const kept = graph.prune(next), lost = next.size - kept.size;
  sel.replace([...kept]);
  if (lost) toast(`Also refunded ${lost} node${lost > 1 ? "s" : ""} that were cut off`);
}
const act = (id) => (sel.set.has(id) ? refund(id) : purchase(id, true));
$("pBtn").onclick = () => act(target());
$("pPath").onclick = () => purchase(target(), true);

const view = new Viewport($("viewport"), $("world"), {
  worldW: tree.world.width, worldH: tree.world.height,
  onTap: (el) => {
    const g = el && el.closest && el.closest("[data-id]"), id = g && g.dataset.id;
    if (id && id === pinned) { act(id); return; }   // second click: buy (or refund if you own it)
    pinned = id || null; render();
  },
  onView: (s, fit) => world.setScale(s, fit),
});
// double-click also buys (the second click of a double-click already does; this covers a first click that only pinned)
$("viewport").addEventListener("dblclick", (e) => { const g = e.target.closest && e.target.closest("[data-id]"); if (g) { pinned = g.dataset.id; if (!sel.set.has(pinned)) purchase(pinned, true); else render(); } });

// restore shared build from the URL
const loadFromUrl = () => {
  const { ids, name, author, base, equip, stale } = readUrl();
  if (stale) toast("This link was made for an older version of the tree, so its skills could not be loaded");
  sel.base = base; sel.equip = {}; for (const id of equip) { const it = data.byId.get(id); if (it) sel.equip[SLOT_KEYS[it.type]] = id; }
  sel.author = author || "";
  sel.replace(ids, name);
  const bad = ids.filter((i) => !sel.valid.has(i)).length;
  if (bad) toast(`${bad} skill${bad > 1 ? "s" : ""} in this link no longer exist`);
};
restoreLast(); loadFromUrl(); render();
addEventListener("hashchange", () => { if (location.href !== lastHref) loadFromUrl(); });
let lastHref = location.href; sel.onChange(() => { lastHref = location.href; });

$("reset").onclick = () => {
  if (!sel.set.size) return;
  const prev = sel.ids(); sel.clear();
  toast("Skills reset", { label: "Undo", fn: () => sel.replace(prev) });
};
$("fit").onclick = () => view.fit(true);
$("buildName").addEventListener("input", (e) => { sel.name = e.target.value.trim(); writeUrl(sel); });
$("buildAuthor").addEventListener("input", (e) => { sel.author = e.target.value.trim().slice(0, 30); writeUrl(sel); });

// collapsible top-right bar (remembers its state)
const bar = $("buildbar"), BAR = "mythfall.barCollapsed";
const setBar = (c) => { bar.classList.toggle("collapsed", c); $("barToggle").setAttribute("aria-expanded", String(!c)); try { localStorage.setItem(BAR, c ? "1" : ""); } catch {} };
try { if (localStorage.getItem(BAR)) setBar(true); } catch {}
$("barToggle").onclick = () => setBar(!bar.classList.contains("collapsed"));

$("share").onclick = async () => {
  const url = shareUrl(sel);
  try { await navigator.clipboard.writeText(url); toast("Link copied"); }
  catch { prompt("Copy this link:", url); }
};
// Publish asks for the build name + author in a small popup at the bottom
const pop = $("pubPop"), closePop = () => { pop.hidden = true; };
$("publish").onclick = () => {
  if (!sel.set.size) return toast("Purchase some skills first");
  if (!pop.hidden) return closePop();
  pop.hidden = false; $("buildName").focus();
};
$("pubCancel").onclick = closePop;
pop.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });
pop.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!sel.name) { $("buildName").focus(); return toast("Give your build a name first"); }
  const { local } = await community.publish(sel.name, sel.ids(), { base: sel.base, equip: Object.values(sel.equip).filter(Boolean), author: sel.author });
  closePop();
  toast(local ? "Saved locally (server not running)" : "Published to community");
});

// ---- editing one of your own published builds: the toolbar is replaced by Confirm / Cancel ----
const applyBuild = (b) => {
  sel.base = (b.base && b.base.length === 6 ? b.base : [0, 0, 0, 0, 0, 0]).map((x) => Math.max(0, Math.min(20, x | 0)));
  sel.equip = {}; for (const id of b.equip || []) { const it = data.byId.get(id); if (it) sel.equip[SLOT_KEYS[it.type]] = id; }
  sel.author = b.author || "";
  sel.replace(b.skills, b.name);
};
let editing = null;   // { id, snap } while editing
const endEdit = () => { editing = null; document.body.classList.remove("editing"); };
const startEdit = (b) => {
  editing = { id: b.id, snap: { skills: sel.ids(), name: sel.name, author: sel.author, base: sel.base.slice(), equip: { ...sel.equip } } };
  document.body.classList.add("editing"); $("pubPop").hidden = true; $("editName").textContent = b.name;
  applyBuild(b); toast("Editing your build: change it, then Confirm");
};
$("editCancel").onclick = () => {
  if (!editing) return;
  const s0 = editing.snap; endEdit();
  sel.base = s0.base; sel.equip = s0.equip; sel.author = s0.author; sel.replace(s0.skills, s0.name);
  toast("Edit cancelled");
};
$("editOk").onclick = async () => {
  if (!editing) return;
  if (!sel.set.size) return toast("Purchase some skills first");
  try {
    await community.update(editing.id, { name: sel.name, author: sel.author, skills: sel.ids(), base: sel.base, equip: Object.values(sel.equip).filter(Boolean) });
    endEdit(); toast("Build updated");
  } catch { toast("Update refused: you can only edit builds you published from this browser (check the Firebase rules)"); }
};

const dlg = $("community");
const openCommunity = async () => {
  const { builds, local } = await community.list();
  $("communityNote").textContent = local ? "Local-only list (the server API isn't reachable)." : "You can delete the builds you published from this browser. If you clear your browser data you lose that ability.";
  const ul = $("communityList"); ul.replaceChildren();
  if (!builds.length) { const li = document.createElement("li"); li.textContent = "No builds published yet."; ul.append(li); }
  for (const b of builds) {
    const li = document.createElement("li");
    const meta = document.createElement("div"); meta.className = "meta";
    const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = b.name;
    const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = `${b.author ? "by " + b.author + " · " : ""}${b.skills.length} skills${b.equip && b.equip.length ? " · gear" : ""} · ${new Date(b.createdAt).toLocaleDateString()}`;
    meta.append(nm, sub);
    const load = document.createElement("button"); load.className = "mf-btn sm"; load.textContent = "Load";
    load.onclick = () => { applyBuild(b); dlg.close(); };
    li.append(meta, load);
    if (!editing && community.canEdit(b)) {
      const ed = document.createElement("button"); ed.className = "mf-btn sm dim"; ed.textContent = "Edit";
      ed.onclick = () => { dlg.close(); startEdit(b); };
      li.append(ed);
    }
    if (community.canDelete(b)) {
      const del = document.createElement("button"); del.className = "mf-btn sm del"; del.textContent = "Delete";
      del.onclick = async () => {
        if (!confirm(`Delete "${b.name}" from the community?`)) return;
        try { await community.remove(b.id); toast("Deleted"); openCommunity(); } catch { toast("Delete refused: you can only delete builds you published from this browser"); }
      };
      if (community.isAdmin()) {
        const ren = document.createElement("button"); ren.className = "mf-btn sm dim"; ren.textContent = "Rename";
        ren.onclick = async () => {
          const name = prompt("Build name:", b.name); if (name === null || !name.trim()) return;
          const author = prompt("Author (leave empty for none):", b.author || ""); if (author === null) return;
          try { await community.rename(b.id, { name: name.trim().slice(0, 40), author: author.trim().slice(0, 30) }); toast("Renamed"); openCommunity(); } catch { toast("Rename refused: update the Firebase rules (see README)"); }
        };
        li.append(ren);
      }
      li.append(del);
    }
    ul.append(li);
  }
  dlg.showModal();
};
$("communityBtn").onclick = openCommunity;
$("closeCommunity").onclick = () => dlg.close();
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

// ---- typed codes (anywhere except inside a text box): admin mode, and a secret ----
// The admin code is not kept in this file, only its SHA-256 and length. What you type is also the real Firebase password, so Firebase enforces who may delete/rename.
const ADMIN_LEN = 8, ADMIN_HASH = "69e3370055c23caa4ef9aba6bc1ceb971345fb45dc77bbfb2ef16d8c7c699823", SECRET = "dodge"; let typed = "";
const sha256 = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, "0")).join("");
const egg = $("egg"), eggVideo = $("eggVideo");
const endEgg = () => { eggVideo.pause(); egg.hidden = true; };
eggVideo.addEventListener("ended", endEgg);
egg.addEventListener("pointerdown", endEgg);                      // click to skip
addEventListener("keydown", async (e) => {
  if (e.key === "Escape" && !egg.hidden) return endEgg();
  if (e.target.closest && e.target.closest("input, textarea") || e.key.length !== 1) return;
  typed = (typed + e.key.toLowerCase()).slice(-12);
  if (typed.endsWith(SECRET)) { typed = ""; egg.hidden = false; eggVideo.currentTime = 0; eggVideo.play().catch(endEgg); return; }
  if (typed.length < ADMIN_LEN) return;
  const code = typed.slice(-ADMIN_LEN);
  if (!crypto.subtle || await sha256(code) !== ADMIN_HASH) return;
  typed = "";
  if (community.isAdmin()) { community.adminOff(); document.body.classList.remove("admin"); toast("Admin mode off"); return; }
  if (await community.adminLogin(code)) { document.body.classList.add("admin"); toast("Admin mode on: open Community to rename or delete builds"); }
  else toast("Admin sign-in failed (admin user not set up in Firebase yet)");
});

// ---- changelog (data/changelog.json, newest first; a dot shows when there is something you have not seen) ----
const clDlg = $("changelog"), SEEN = "mythfall.changelogSeen";
let changelog = [];
try { changelog = await (await fetch("data/changelog.json", { cache: "no-store" })).json(); } catch {}
const seen = () => { try { return localStorage.getItem(SEEN) || ""; } catch { return ""; } };
const stamp = (e) => e.date + "|" + e.title;
$("clDot").hidden = !changelog.length || stamp(changelog[0]) === seen();
$("changelogBtn").onclick = () => {
  const box = $("changelogList"); box.replaceChildren();
  for (const e of changelog) {
    const sec = document.createElement("section"), h = document.createElement("h3"), ul = document.createElement("ul");
    h.textContent = `${e.title}`; const d = document.createElement("span"); d.textContent = new Date(e.date + "T12:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); h.prepend(d);
    for (const t of e.items) { const li = document.createElement("li"); li.textContent = t; ul.append(li); }
    sec.append(h, ul); box.append(sec);
  }
  if (!changelog.length) box.textContent = "No updates yet.";
  try { if (changelog[0]) localStorage.setItem(SEEN, stamp(changelog[0])); } catch {}
  $("clDot").hidden = true; clDlg.showModal();
};
$("closeChangelog").onclick = () => clDlg.close();
clDlg.addEventListener("click", (e) => { if (e.target === clDlg) clDlg.close(); });
