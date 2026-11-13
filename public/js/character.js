// Character screen: live Base Stats (-/+, cap 20 each, 100 total), node bonuses, and the damage-taken pills.
// Equipment slots are placeholders for now ("coming soon").
import { BASE, computeStats, damageTaken, fmt } from "./stats.js";
import { SLOT_KEYS, iconOf, attachTooltip } from "./items.js";
import { initDps } from "./dps-ui.js";
export const CAP = 20, LIMIT = 100;
const SLOTS = [["pet", "Pet"], ["helmet", "Helmet"], ["cape", "Cape"], ["weapon", "Weapon"], ["armor", "Armor"], ["ability", "Ability"], null, ["boots", "Boots"], ["ring", "Ring"]];
let current = null;   // latest computed stats (used by tooltips)
const HITS = [5, 10, 20, 30, 40, 50];

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function initCharacter(sel, { $, graph, data, openPicker, info = {}, effects = {} }) {
  const overlay = $("charOverlay"), host = $("stats"), tip = $("charTip");

  // equipment slots: ghost icon when empty, the item when equipped (hover = tooltip, click = pick)
  const eq = $("slots"), slotEls = [];
  for (const s of SLOTS) {
    if (!s) { eq.append(mk("div", "c-slot empty")); continue; }
    const b = mk("button", "c-slot"); b.title = s[1]; b.setAttribute("aria-label", s[1] + " slot");
    const img = new Image(); img.alt = ""; b.append(img);
    b.onclick = () => openPicker(s[1]);
    attachTooltip(overlay, b, () => data.byId.get(sel.equip[s[0]]), () => current);
    eq.append(b); slotEls.push({ key: s[0], img });
  }

  $("clearGear").onclick = () => sel.setEquip({});
  $("resetStats").onclick = () => sel.setBase([0, 0, 0, 0, 0, 0]);
  // Max All: Vitality, Energy, Defense and Strength to 20 (as far as the 100 total limit allows). Willpower and Dexterity are left alone.
  $("maxStats").onclick = () => {
    const b = sel.base.slice(); let left = LIMIT - b.reduce((a, x) => a + x, 0);
    for (const n of ["Vitality", "Energy", "Defense", "Strength"]) { const i = BASE.indexOf(n), add = Math.max(0, Math.min(CAP - b[i], left)); b[i] += add; left -= add; }
    sel.setBase(b);
  };

  // hover cards (damage-taken pills, base stats, bonus stats): any element with data-tip. The card is a child of the panel,
  // so it is positioned against the panel's own box (not the overlay), which keeps it right at the pointer.
  const panel = $("charPanel");
  const placeTip = (e) => {
    const r = panel.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 18;
    if (x + tip.offsetWidth > r.width - 8) x = e.clientX - r.left - tip.offsetWidth - 14;
    tip.style.left = Math.max(6, x) + "px"; tip.style.top = y + "px";
  };
  panel.addEventListener("pointermove", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t || !panel.contains(t)) { tip.hidden = true; return; }
    if (tip.textContent !== t.dataset.tip) tip.textContent = t.dataset.tip;
    tip.hidden = false; placeTip(e);
  });
  panel.addEventListener("pointerleave", () => { tip.hidden = true; });
  // "Dexterity for 20s Reflexive I" -> the description of Dexterity
  const descOf = (name) => info[name.toLowerCase()] || info[name.split(" for ")[0].toLowerCase()] || "";

  // damage-taken pills
  const pills = HITS.map((hit, t) => {
    const p = mk("div", "c-pill"); $("pills").append(p);
    p.dataset.tip = `The damage that you take from one hit of a typical T${t} monster`;
    return p;
  });

  // base stats
  const rows = BASE.map((name, i) => {
    const row = mk("div", "c-row"), label = mk("span", "c-name", name);
    if (descOf(name)) row.dataset.tip = descOf(name);
    const minus = mk("button", "c-btn", "−"), val = mk("span", "c-val"), plus = mk("button", "c-btn", "+"), bon = mk("span", "c-bonus");
    minus.setAttribute("aria-label", `Remove ${name}`); plus.setAttribute("aria-label", `Add ${name}`);
    const change = (d) => { const b = sel.base.slice(), total = b.reduce((a, x) => a + x, 0), n = b[i] + d; if (n < 0 || n > CAP || (d > 0 && total >= LIMIT)) return; b[i] = n; sel.setBase(b); };
    minus.onclick = () => change(-1); plus.onclick = () => change(1);
    // MAX: raise this stat to 20, or as high as the 100 total limit still allows
    const max = mk("button", "c-btn max", "»"); max.setAttribute("aria-label", `Max ${name}`); max.title = "Max";
    const room = () => Math.min(CAP, LIMIT - (sel.base.reduce((a, x) => a + x, 0) - sel.base[i]));
    max.onclick = () => { const b = sel.base.slice(); b[i] = room(); sel.setBase(b); };
    row.append(label, minus, val, plus, max, bon); host.append(row);
    return { val, minus, plus, bon, max, room };
  });

  const render = () => {
    const total = sel.base.reduce((a, x) => a + x, 0);
    const gear = Object.values(sel.equip).map((id) => data.byId.get(id)).filter(Boolean);
    const stats = current = computeStats([...sel.set].map((id) => graph.nodes.get(id)).filter(Boolean), sel.base, gear);
    for (const { key, img } of slotEls) { const it = data.byId.get(sel.equip[key]); img.src = it ? iconOf(it) : `assets/slots/${key}.png`; img.parentElement.classList.toggle("filled", !!it); }
    $("clearGear").disabled = !gear.length; $("resetStats").disabled = total === 0; $("maxStats").disabled = total >= LIMIT || ["Vitality", "Energy", "Defense", "Strength"].every((n) => sel.base[BASE.indexOf(n)] >= CAP);
    BASE.forEach((n, i) => {
      const r = rows[i], b = stats.base[n].bonus;
      r.val.textContent = `${sel.base[i]}/${CAP}`; r.minus.disabled = sel.base[i] <= 0; r.plus.disabled = sel.base[i] >= CAP || total >= LIMIT; r.max.disabled = r.room() <= sel.base[i];
      r.bon.textContent = b ? fmt(b) : ""; r.bon.classList.toggle("neg", b < 0);
    });
    $("limitFill").style.width = (total / LIMIT) * 100 + "%"; $("limitTxt").textContent = `Stat Limit: ${total}/${LIMIT}`;
    const defense = stats.base.Defense.total;
    pills.forEach((p, i) => { p.textContent = `${HITS[i]}->${damageTaken(HITS[i], defense)}`; });
    const bl = $("bonusList"); bl.replaceChildren();
    for (const [name, v] of stats.list) { const row = mk("div", "c-row bonus"); if (descOf(name)) row.dataset.tip = descOf(name); const val = mk("span", "c-bonus" + (v < 0 ? " neg" : ""), fmt(v)); row.append(mk("span", "c-name", name), val); bl.append(row); }
  };
  const dps = initDps({ $, mk, sel, data, info, effects, stats: () => current });

  const open = () => { overlay.hidden = false; render(); dps.refresh(); }, close = () => { overlay.hidden = true; tip.hidden = true; dps.stop(); };
  $("charBtn").onclick = open; $("charClose").onclick = close;
  overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) close(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });
  return { render, stats: () => current };
}
