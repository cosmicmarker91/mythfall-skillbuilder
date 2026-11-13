#!/usr/bin/env python3
"""Stat descriptions for the hover cards (+ status effects for the DPS test). Input: source/stats.raw.json (https://mythfall.wiki.gg/index.php?title=Module:Data/stats.json&action=raw).
Output: public/data/stats.json  { "<lowercase stat name>": "<description>" }  (the FullName is added as a second key)."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
raw = json.loads((root / "source" / "stats.raw.json").read_text())
out = {}
for s in raw:
    d = (s.get("Description") or "").strip()
    if not d: continue
    out[s["Name"].lower()] = d
    if s.get("FullName"): out.setdefault(s["FullName"].lower(), d)
(root / "public" / "data" / "stats.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
print(len(out), "stat descriptions")

# status effects: name -> tiers with their stat rows (used for "Upon dashing, gain <effect>" buffs in the DPS test)
fx = json.loads((root / "source" / "status-effects.raw.json").read_text())
eff = {}
for e in fx:
    eff.setdefault(e["Name"], [{"tier": t["Name"], "rows": [r["Text"] for r in t.get("Rows", [])]} for t in e.get("Tiers", [])])
(root / "public" / "data" / "effects.json").write_text(json.dumps(eff, indent=1, ensure_ascii=False))
print(len(eff), "status effects")
