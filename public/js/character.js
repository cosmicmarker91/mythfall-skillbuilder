// Character screen: live Base Stats (-/+, cap 20 each, 100 total), node bonuses, and the damage-taken pills.
// Equipment slots are placeholders for now ("coming soon").
import { BASE, computeStats, damageTaken, fmt } from "./stats.js";
import { SLOT_KEYS, iconOf, attachTooltip } from "./items.js";
export const CAP = 20, LIMIT = 100;
const SLOTS = [["pet", "Pet"], ["helmet", "Helmet"], ["cape", "Cape"], ["weapon", "Weapon"], ["armor", "Armor"], ["ability", "Ability"], null, ["boots", "Boots"], ["ring", "Ring"]];
let current = null;   // latest computed stats (used by tooltips)
const HITS = [5, 10, 20, 30, 40, 50];

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function initCharacter(sel, { $, graph, data, openPicker }) {
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

  // damage-taken pills with the hover explanation
  const pills = HITS.map((hit, t) => {
    const p = mk("div", "c-pill"); $("pills").append(p);
    p.addEventListener("pointerenter", () => { tip.textContent = `The damage that you take from one hit of a typical T${t} monster`; tip.hidden = false; });
    p.addEventListener("pointermove", (e) => { const r = overlay.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 8) + "px"; tip.style.top = e.clientY - r.top + 22 + "px"; });
    p.addEventListener("pointerleave", () => { tip.hidden = true; });
    return p;
  });

  // base stats
  const rows = BASE.map((name, i) => {
    const row = mk("div", "c-row"), label = mk("span", "c-name", name);
    const minus = mk("button", "c-btn", "−"), val = mk("span", "c-val"), plus = mk("button", "c-btn", "+"), bon = mk("span", "c-bonus");
    minus.setAttribute("aria-label", `Remove ${name}`); plus.setAttribute("aria-label", `Add ${name}`);
    const change = (d) => { const b = sel.base.slice(), total = b.reduce((a, x) => a + x, 0), n = b[i] + d; if (n < 0 || n > CAP || (d > 0 && total >= LIMIT)) return; b[i] = n; sel.setBase(b); };
    minus.onclick = () => change(-1); plus.onclick = () => change(1);
    row.append(label, minus, val, plus, bon); host.append(row);
    return { val, minus, plus, bon };
  });

  const render = () => {
    const total = sel.base.reduce((a, x) => a + x, 0);
    const gear = Object.values(sel.equip).map((id) => data.byId.get(id)).filter(Boolean);
    const stats = current = computeStats([...sel.set].map((id) => graph.nodes.get(id)).filter(Boolean), sel.base, gear);
    for (const { key, img } of slotEls) { const it = data.byId.get(sel.equip[key]); img.src = it ? iconOf(it) : `assets/slots/${key}.png`; img.parentElement.classList.toggle("filled", !!it); }
    $("clearGear").disabled = !gear.length; $("resetStats").disabled = total === 0;
    BASE.forEach((n, i) => {
      const r = rows[i], b = stats.base[n].bonus;
      r.val.textContent = `${sel.base[i]}/${CAP}`; r.minus.disabled = sel.base[i] <= 0; r.plus.disabled = sel.base[i] >= CAP || total >= LIMIT;
      r.bon.textContent = b ? fmt(b) : ""; r.bon.classList.toggle("neg", b < 0);
    });
    $("limitFill").style.width = (total / LIMIT) * 100 + "%"; $("limitTxt").textContent = `Stat Limit: ${total}/${LIMIT}`;
    const defense = stats.base.Defense.total;
    pills.forEach((p, i) => { p.textContent = `${HITS[i]}->${damageTaken(HITS[i], defense)}`; });
    const bl = $("bonusList"); bl.replaceChildren();
    for (const [name, v] of stats.list) { const row = mk("div", "c-row bonus"); const val = mk("span", "c-bonus" + (v < 0 ? " neg" : ""), fmt(v)); row.append(mk("span", "c-name", name), val); bl.append(row); }
  };
  const open = () => { overlay.hidden = false; render(); }, close = () => { overlay.hidden = true; tip.hidden = true; };
  $("charBtn").onclick = open; $("charClose").onclick = close;
  overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) close(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });
  return { render, stats: () => current };
}
