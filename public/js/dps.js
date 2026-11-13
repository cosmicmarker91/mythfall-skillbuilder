// DPS test: a 10-second fight against one training dummy.
// Rules (confirmed by the site owner):  Rate = attacks per second;  each point of Bonus Attack Speed adds 0.1 to the weapon's rate;
// crit = 1.75x;  every projectile deals full damage;  explosions and impact shots count;  one target;  abilities are not used;
// Bleed on the dummy = +20% damage (a switch, no timer);  Poison / Burn / Bleed damage over time is ignored;  a higher tier of an effect overwrites a lower one.
export const DURATION = 10, CRIT_MULT = 1.75, RUNS = 400;
export const RATE_PER_BAS = 0.1;
export const PASSIVES = ["Measured Strikes"];   // triggered passives the test can simulate
const STAT = { Str: "Strength", Dex: "Dexterity", Wil: "Willpower" };
const BLEED_MULT = 1.2, ENRAGE_SECONDS = 3;
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
export const tierOf = (label) => { const m = /^(.*?)\s+(I|II|III|IV|V)$/.exec(label); return m ? { effect: m[1], tier: ROMAN[m[2]] } : { effect: label, tier: 1 }; };
const find = (rows, label) => (rows || []).find((e) => e.Label === label);
const bonus = (stats, name) => { const e = stats.list.find(([n]) => n === name); return e ? e[1] : 0; };

// "+1% Str" scaling: +1% of the damage per point of your TOTAL stat (same rule as the item tooltips). tot(name) = total of a stat.
function scaled(base, note, tot) {
  const parts = [...(note || "").matchAll(/(\d+(?:\.\d+)?)% (Str|Dex|Wil)/g)];
  return base + parts.reduce((s, m) => s + base * (+m[1] / 100) * tot(STAT[m[2]]), 0);
}

// Everything the simulation needs, read once from the weapon + your stats.
// ctx: { simulated: names handled elsewhere, effects: status-effects data, passives: Set of enabled passives, enragedTier: tier of an always-on Enraged (0 = none), bleed: dummy is bleeding }
export function profile(weapon, stats, info = {}, ctx = {}) {
  const tip = weapon.tip || {}, S = tip.Stats || [], I = tip.OnImpact || [];
  const flat = bonus(stats, "Damage"), pct = bonus(stats, "Bonus Damage Percent");
  const has = (n) => bonus(stats, n) > 0 && (!ctx.passives || ctx.passives.has(n));
  const impactHead = (I[0] && I[0].Text) || "", isExplosion = /Explosion/.test(impactHead);
  const part = (rows) => { const d = find(rows, "Damage"); return d ? { base: parseFloat(d.Text), note: (find(rows, "Scaling") || {}).Note } : null; };
  const parts = { direct: part(S), explosion: I.length && isExplosion ? part(I) : null, burst: I.length && !isExplosion ? part(I) : null };
  const dmgOf = (pt, extra) => pt ? Math.max(0, (scaled(pt.base, pt.note, (n) => stats.total(n) + (extra[n] || 0)) + flat) * (1 + pct / 100)) : 0;
  const at = (extra) => ({ direct: dmgOf(parts.direct, extra), explosion: dmgOf(parts.explosion, extra), burst: dmgOf(parts.burst, extra) });
  // Enraged (tier I) from Measured Strikes: its stat bonus only matters through weapon scaling
  const enrRow = /^([+-]\d+(?:\.\d+)?) (.+)$/.exec((((ctx.effects || {}).Enraged || [])[0] || { rows: [] }).rows[0] || "");
  const enrExtra = enrRow ? { [enrRow[2]]: +enrRow[1] } : {};
  const baseRate = parseFloat((find(S, "Rate") || {}).Text), bas = bonus(stats, "Bonus Attack Speed");
  const enrOn = (ctx.enragedTier || 0) >= 1;                 // an always-on Enraged (tier I or higher) already covers Measured Strikes' tier I
  const p = {
    weapon: weapon.name, baseRate, rate: baseRate + RATE_PER_BAS * bas,
    shots: parseInt((find(S, "Projectiles") || {}).Text) || 1,
    extraShots: bonus(stats, "Projectiles"), extraShotChance: bonus(stats, "Bonus Projectile Chance") / 100,
    crit: Math.min(1, Math.max(0, bonus(stats, "Critical Chance") / 100)),
    norm: at({}), burstShots: parts.burst ? parseInt((find(I, "Projectiles") || {}).Text) || 0 : 0,
    measured: has("Measured Strikes") && !enrOn, bleed: !!ctx.bleed, flat, pct,
  };
  p.enr = p.measured ? at(enrExtra) : p.norm;
  // what the result tells you was assumed or left out
  const notes = [];
  if (p.bleed) notes.push("Bleed: the dummy takes 20% more damage for the whole test.");
  if (p.measured) notes.push(`Measured Strikes: a crit gives Enraged tier I (${enrRow ? enrRow[0] + " " + enrRow[2] : "stat bonus"}) for ${ENRAGE_SECONDS}s.`);
  if (has("Measured Strikes") && enrOn) notes.push("Measured Strikes adds nothing: a higher or equal Enraged is already on.");
  notes.push("Poison, Burn and Bleed damage over time is ignored.");
  const skip = new Set([...(ctx.simulated || []), ...PASSIVES]);
  const triggers = stats.list.map(([n]) => n).filter((n) => /^(Upon|Hits |Gives a percent chance)/.test(info[n.toLowerCase()] || "") && !skip.has(n));
  if (triggers.length) notes.push(`Not simulated (damage or target not in the game data): ${triggers.join(", ")}.`);
  if (find(S, "Backstab")) notes.push("Backstab is not counted (the dummy is always hit from the front).");
  notes.push("Shots hit instantly (no travel time) and the dummy has no defense.");
  p.notes = notes;
  return p;
}

// One 10 second run. Returns the damage events (for the live counter / viewer) and the totals.
export function simulate(p, rnd = Math.random) {
  const events = [], kinds = { hit: 0, explosion: 0, shots: 0 }, mult = p.bleed ? BLEED_MULT : 1;
  let crits = 0, hits = 0, attacks = 0, enragedUntil = -1;
  const deal = (t, base, kind) => {
    if (base <= 0) return;
    const crit = rnd() < p.crit;
    const dmg = Math.round(base * (crit ? CRIT_MULT : 1) * mult * 100) / 100;
    events.push({ t, dmg, kind, crit }); kinds[kind] += dmg; hits++;
    if (crit) { crits++; if (p.measured) enragedUntil = Math.max(enragedUntil, t + ENRAGE_SECONDS); }
  };
  for (let k = 0; k / p.rate < DURATION - 1e-9; k++) {   // attacks at 0, 1/rate, 2/rate ... inside the 10 seconds
    const t = k / p.rate; attacks++;
    const extra = p.extraShots + p.extraShotChance;           // e.g. 0.3 = a 30% chance of one more projectile, 1.5 = one more plus a 50% chance of another
    let n = p.shots + Math.floor(extra); if (rnd() < extra - Math.floor(extra)) n++;
    for (let i = 0; i < n; i++) {
      const v = t < enragedUntil ? p.enr : p.norm;
      deal(t, v.direct, "hit");
      deal(t, v.explosion, "explosion");
      for (let j = 0; j < p.burstShots; j++) deal(t, v.burst, "shots");
    }
  }
  const total = events.reduce((s, e) => s + e.dmg, 0);
  const statusEvents = p.bleed ? [{ name: "Bleed", t: 0, seconds: DURATION }] : [];
  return { events, statusEvents, total, dps: total / DURATION, kinds, crits, hits, attacks, applied: {} };
}

// Average of many runs (what you should expect on a typical 10 seconds).
export function average(p, runs = RUNS) {
  let sum = 0, lo = Infinity, hi = 0;
  for (let i = 0; i < runs; i++) { const r = simulate(p); sum += r.dps; lo = Math.min(lo, r.dps); hi = Math.max(hi, r.dps); }
  return { avg: sum / runs, lo, hi };
}

// ---- selectable buffs: only the ones the FULL books (not the "(Pg n)" pages) can give you, and only those that change damage ----
const DAMAGE_STATS = new Set(["Strength", "Dexterity", "Willpower", "Critical Chance", "Bonus Attack Speed", "Damage", "Bonus Damage Percent"]);
const BASE_NAMES = new Set(["Vitality", "Energy", "Willpower", "Defense", "Strength", "Dexterity"]);
export function availableBuffs(items) {
  const out = [];
  for (const it of items) {
    if (it.type !== "Ability" || !/^Ability \(Buff/.test(it.sub) || /\(Pg \d+\)/.test(it.name)) continue;
    for (const r of (it.tip && it.tip.Stats) || []) {
      const m = /^(?:With (\w+): )?([+-]\d+(?:\.\d+)?) (.+?) for (\d+)s$/.exec(r.Text || "");
      if (!m || !DAMAGE_STATS.has(m[3])) continue;
      out.push({ key: r.Label, label: r.Label, ...tierOf(r.Label), book: it.name, weapon: m[1] || "", stat: m[3], amount: +m[2] });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}
// stats with the chosen buffs added. They are simply on or off (no timers). If two buffs are the same effect, only the higher tier counts.
export function withBuffs(stats, buffs, weapon) {
  const best = new Map();
  for (const b of buffs.filter((x) => !x.weapon || (weapon && weapon.cls === x.weapon))) { const c = best.get(b.effect); if (!c || b.tier > c.tier) best.set(b.effect, b); }
  const act = [...best.values()];
  if (!act.length) return { stats, active: [] };
  const add = {}; for (const b of act) add[b.stat] = (add[b.stat] || 0) + b.amount;
  const list = stats.list.map(([n, v]) => [n, v + (add[n] || 0)]);
  for (const [n, v] of Object.entries(add)) if (!BASE_NAMES.has(n) && !list.some(([m]) => m === n)) list.push([n, v]);
  return { stats: { ...stats, list, total: (n) => stats.total(n) + (add[n] || 0) }, active: act };
}
