// DPS test UI: the "Test DPS" button (instant result), the effect picker, and the "View test" window with the training dummy.
import { DURATION, PASSIVES, tierOf, profile, simulate, average, availableBuffs, withBuffs } from "./dps.js";

const ICON = { Bleed: "bleed", Poison: "poison", Burn: "burn", Fractured: "guardbreak", Slowed: "slow", Bind: "bind", Stunned: "stun", Slimed: "slime" };
const KEY = "mythfall.dpsEffects", DKEY = "mythfall.dpsDash", PKEY = "mythfall.dpsPassivesOff", BKEY = "mythfall.dpsBleed";
const DAMAGE_STATS = new Set(["Strength", "Dexterity", "Willpower", "Critical Chance", "Bonus Attack Speed", "Damage", "Bonus Damage Percent"]);
const SCALE = 8;                              // dummy sprite is drawn at 8x, pixel-perfect
const FLASH = 0.5, FLASH_MS = 150;            // white overlay when the dummy is hit

export function initDps({ $, mk, sel, data, info, effects = {}, stats }) {
  const out = $("dpsOut"), btn = $("dpsBtn"), fxBtn = $("fxBtn");
  const buffs = availableBuffs(data.items);
  let chosen = new Set();
  try { chosen = new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch {}
  chosen = new Set([...chosen].filter((k) => buffs.some((b) => b.key === k)));
  const saveChosen = () => { try { localStorage.setItem(KEY, JSON.stringify([...chosen])); } catch {} };

  // the dummy is bleeding: +20% damage taken, a plain switch (no timer)
  let bleedOn = false; try { bleedOn = localStorage.getItem(BKEY) === "1"; } catch {}
  const saveBleed = () => { try { localStorage.setItem(BKEY, bleedOn ? "1" : ""); } catch {} };

  // "Upon dashing, gain <effect> for N seconds" from your gear and skills (Dancing Tempo, Demonic Dance ...). Off until you switch them on.
  let dashOn = new Set(); try { dashOn = new Set(JSON.parse(localStorage.getItem(DKEY) || "[]")); } catch {}
  const saveDash = () => { try { localStorage.setItem(DKEY, JSON.stringify([...dashOn])); } catch {} };
  const dashBuffs = () => {
    const out = [], st = stats(); if (!st) return out;    // not computed until the Character screen is first opened
    for (const [name] of st.list) {
      const m = /^Upon dashing, gain (.+?) status effect for (\d+) seconds?$/.exec(info[name.toLowerCase()] || ""); if (!m) continue;
      const tier = (effects[m[1]] || [])[0]; if (!tier) continue;                       // tier I (the game data does not say which tier a dash grants)
      const r = /^([+-]\d+(?:\.\d+)?) (.+)$/.exec(tier.rows[0] || ""); if (!r || !DAMAGE_STATS.has(r[2])) continue;
      out.push({ key: "dash:" + name, label: name, ...tierOf(tier.tier), book: `Upon dashing: ${tier.tier}`, weapon: "", stat: r[2], amount: +r[1], dash: true });
    }
    return out;
  };
  // triggered passives you own (Measured Strikes, Rending Fury): simulated by default, switch off here
  let passOff = new Set(); try { passOff = new Set(JSON.parse(localStorage.getItem(PKEY) || "[]")); } catch {}
  const savePass = () => { try { localStorage.setItem(PKEY, JSON.stringify([...passOff])); } catch {} };
  const ownedPassives = () => { const st = stats(); return st ? PASSIVES.filter((n) => st.list.some(([m]) => m === n)) : []; };
  const count = () => chosen.size + (bleedOn ? 1 : 0) + dashBuffs().filter((b) => dashOn.has(b.key)).length;
  const label = () => { const n = count(); fxBtn.textContent = n ? `Effects (${n})` : "Effects"; };
  label();

  // ---------- effect picker ----------
  const fx = $("fxOverlay"), list = $("fxList");
  const drawFx = () => {
    list.replaceChildren();
    list.append(mk("div", "fx-head first", "On the dummy"));
    const brow = mk("button", "fx-row" + (bleedOn ? " on" : ""));
    brow.append(mk("div", "fx-name", "Bleed" + (bleedOn ? "  (active)" : "  (off)")), mk("div", "fx-sub", "+20% damage taken"), mk("div", "fx-src", "The dummy bleeds for the whole test"));
    brow.onclick = () => { bleedOn = !bleedOn; saveBleed(); label(); drawFx(); };
    list.append(brow);
    list.append(mk("div", "fx-head", "Book buffs"));
    for (const b of buffs) {
      const row = mk("button", "fx-row" + (chosen.has(b.key) ? " on" : ""));
      const head = mk("div", "fx-name", b.label), sub = mk("div", "fx-sub", `${b.amount > 0 ? "+" : ""}${b.amount} ${b.stat}`);
      const src = mk("div", "fx-src", `${b.book}${b.weapon ? ` · ${b.weapon} only` : ""}`);
      row.append(head, sub, src);
      row.onclick = () => { chosen.has(b.key) ? chosen.delete(b.key) : chosen.add(b.key); saveChosen(); label(); drawFx(); };
      list.append(row);
    }
    if (!buffs.length) list.append(mk("div", "fx-note", "No buff books found."));
    list.append(mk("div", "fx-head", "Dash effects"));
    const dash = dashBuffs();
    if (!dash.length) list.append(mk("div", "fx-note", "None from your equipped gear or skills (for example Demon Mask, Glass Tiara, Dancing Tempo)."));
    if (dash.length) {
      const allOn = dash.every((b) => dashOn.has(b.key)), all = mk("button", "fx-row all" + (allOn ? " on" : ""));
      all.append(mk("div", "fx-name", "All dash effects: " + (allOn ? "ON" : "OFF")));
      all.onclick = () => { if (allOn) dash.forEach((b) => dashOn.delete(b.key)); else dash.forEach((b) => dashOn.add(b.key)); saveDash(); label(); drawFx(); };
      list.append(all);
    }
    for (const b of dash) {
      const row = mk("button", "fx-row" + (dashOn.has(b.key) ? " on" : ""));
      row.append(mk("div", "fx-name", b.label + (dashOn.has(b.key) ? "  (active)" : "  (off)")), mk("div", "fx-sub", `${b.amount > 0 ? "+" : ""}${b.amount} ${b.stat}`), mk("div", "fx-src", b.book));
      row.onclick = () => { dashOn.has(b.key) ? dashOn.delete(b.key) : dashOn.add(b.key); saveDash(); label(); drawFx(); };
      list.append(row);
    }
    list.append(mk("div", "fx-head", "Triggered passives"));
    const own = ownedPassives();
    if (!own.length) list.append(mk("div", "fx-note", "None from your skills or gear (the test can use Measured Strikes)."));
    for (const n of own) {
      const on = !passOff.has(n), row = mk("button", "fx-row" + (on ? " on" : ""));
      row.append(mk("div", "fx-name", n + (on ? "  (active)" : "  (off)")), mk("div", "fx-src", info[n.toLowerCase()] || ""));
      row.onclick = () => { on ? passOff.add(n) : passOff.delete(n); savePass(); drawFx(); };
      list.append(row);
    }
  };
  const openFx = () => { drawFx(); fx.hidden = false; }, closeFx = () => { fx.hidden = true; };
  fxBtn.onclick = openFx; $("fxClose").onclick = closeFx; $("fxDone").onclick = closeFx;
  $("fxClear").onclick = () => { chosen.clear(); dashOn.clear(); bleedOn = false; saveChosen(); saveDash(); saveBleed(); label(); drawFx(); };
  fx.addEventListener("pointerdown", (e) => { if (e.target === fx) closeFx(); });

  // ---------- the "View test" window ----------
  const view = $("dpsView"), cv = $("dvDummy"), ctx = cv.getContext("2d"), nums = $("dvNums"), statusBox = $("dvStatus");
  const sprite = new Image(); sprite.src = "assets/dummy.png";
  ctx.imageSmoothingEnabled = false;
  let last = null, raf = 0, flashAt = -1e9;
  const drawDummy = (now) => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!sprite.complete) return;
    const w = sprite.width * SCALE, h = sprite.height * SCALE, x = (cv.width - w) / 2, y = cv.height - h;
    ctx.globalCompositeOperation = "source-over"; ctx.drawImage(sprite, x, y, w, h);
    const k = 1 - (now - flashAt) / FLASH_MS;
    if (k > 0) { ctx.globalCompositeOperation = "source-atop"; ctx.fillStyle = `rgba(255,255,255,${FLASH * k})`; ctx.fillRect(x, y, w, h); }
  };
  const pop = (e) => {
    const n = mk("div", "dv-num" + (e.crit ? " crit" : ""), String(Math.round(e.dmg * 10) / 10));
    n.style.left = 50 + (Math.random() * 44 - 22) + "%";
    nums.append(n);
    n.animate([{ transform: "translate(-50%, 0)", opacity: 1 }, { transform: `translate(-50%, ${-48 - Math.random() * 24}px)`, opacity: 0 }], { duration: 750, easing: "ease-out" }).onfinish = () => n.remove();
    while (nums.children.length > 40) nums.firstChild.remove();
  };
  let shownStatus = "";
  const drawStatus = (names) => {                    // icons only, always centred above the dummy
    const key = names.join("|"); if (key === shownStatus) return; shownStatus = key;
    statusBox.replaceChildren();
    for (const n of names) { const im = new Image(); im.src = `assets/status/${ICON[n]}.png`; im.alt = n; im.title = n; statusBox.append(im); }
  };
  const stop = () => { cancelAnimationFrame(raf); };
  const play = () => {
    stop(); if (!last) return;
    const { run } = last; let i = 0, sum = 0; nums.replaceChildren(); shownStatus = "x"; drawStatus([]);
    const t0 = performance.now();
    const frame = (now) => {
      const t = Math.min(DURATION, Math.max(0, (now - t0) / 1000));
      while (i < run.events.length && run.events[i].t <= t) { sum += run.events[i].dmg; pop(run.events[i]); flashAt = now; i++; }
      $("dvDps").textContent = `DPS: ${(t >= DURATION ? run.total / DURATION : sum / Math.max(t, 1)).toFixed(2)}`;
      $("dvFill").style.width = (t / DURATION) * 100 + "%"; $("dvTime").textContent = `${t.toFixed(1)} / ${DURATION}s`;
      const active = new Map();
      for (const s of run.statusEvents) if (s.t <= t && t < s.t + s.seconds && ICON[s.name]) active.set(s.name, true);
      drawStatus([...active.keys()]);
      drawDummy(now);
      if (t < DURATION || now - flashAt < FLASH_MS) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };
  const openView = () => { view.hidden = false; play(); }, closeView = () => { stop(); view.hidden = true; };
  $("dvClose").onclick = closeView; $("dvReplay").onclick = play;
  view.addEventListener("pointerdown", (e) => { if (e.target === view) closeView(); });
  // Esc closes the topmost window first (capture phase, before the Character screen sees it)
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!view.hidden) { closeView(); e.stopPropagation(); } else if (!fx.hidden) { closeFx(); e.stopPropagation(); }
  }, true);

  // ---------- Test DPS: the result is instant, the window is optional ----------
  const row = (l, v) => { const r = mk("div", "r"); r.append(mk("span", "", l), mk("span", "", v)); return r; };
  const f1 = (n) => (Math.round(n * 10) / 10).toString();
  btn.onclick = () => {
    out.replaceChildren(); last = null;
    const weapon = data.byId.get(sel.equip.weapon);
    if (!weapon) { out.append(mk("div", "note", "Equip a weapon first.")); return; }
    const dashActive = dashBuffs().filter((b) => dashOn.has(b.key)), picked = [...buffs.filter((b) => chosen.has(b.key)), ...dashActive];
    const { stats: st, active } = withBuffs(stats(), picked, weapon);
    const enr = active.find((b) => b.effect === "Enraged");
    const ctx = { simulated: dashBuffs().map((b) => b.label), effects, passives: new Set(PASSIVES.filter((n) => !passOff.has(n))), enragedTier: enr ? enr.tier : 0, bleed: bleedOn };
    const p = profile(weapon, st, info, ctx), run = simulate(p), avg = average(p);
    const dropped = picked.filter((b) => (!b.weapon || b.weapon === weapon.cls) && !active.includes(b));
    if (dropped.length) p.notes.unshift(`A higher tier overwrites the lower one, so these add nothing: ${dropped.map((b) => b.label).join(", ")}.`);
    if (active.length) p.notes.unshift(`Effects on for the whole test: ${active.map((b) => b.label).join(", ")}.`);
    if (picked.length > active.length + dropped.length) p.notes.unshift("Some selected effects were skipped (they need a different weapon type).");
    last = { run, p };
    const head = mk("div", "dpshead"), g = mk("div", "dps-gold sm", `DPS: ${run.dps.toFixed(2)}`), v = mk("button", "c-btn wide go2", "View test");
    v.onclick = openView; head.append(g, v); out.append(head);
    out.append(row(`Average DPS (${400} runs)`, `${avg.avg.toFixed(2)}  (${avg.lo.toFixed(0)}-${avg.hi.toFixed(0)})`),
      row("Total damage in 10s", Math.round(run.total)),
      row("Attacks per second", f1(p.rate) + (p.rate !== p.baseRate ? `  (base ${f1(p.baseRate)})` : "")),
      row("Projectiles per attack", f1(p.shots + p.extraShots + p.extraShotChance)),
      row("Critical hits", `${run.crits} of ${run.hits}  (${f1(p.crit * 100)}% chance, x1.75)`));
    const k = run.kinds;
    if (k.hit) out.append(row("Direct hits", Math.round(k.hit) + " dmg"));
    if (k.explosion) out.append(row("Explosions", Math.round(k.explosion) + " dmg"));
    if (k.shots) out.append(row("Impact shots", Math.round(k.shots) + " dmg"));
    for (const [n, a] of Object.entries(run.applied)) out.append(row(n + " applied", a.seconds ? `${a.count}x (${a.seconds}s each)` : `${a.count}x`));
    out.append(mk("div", "note", p.notes.join(" ")));
  };

  return { stop() { stop(); view.hidden = true; fx.hidden = true; }, refresh: label };
}
