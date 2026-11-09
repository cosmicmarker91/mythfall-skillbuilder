# Mythfall Skill Tree Planner

Static website (plain HTML/CSS/JS ES modules). No framework, no dependencies, no build step.

## Run locally
`node server.mjs` → http://localhost:5173 (also serves a tiny file-backed community API).
Any static server pointed at `public/` also works.

## Deploy (Cloudflare Pages)
- Framework preset: **None**
- Build command: *(leave empty)*
- Build output directory: **`public`**
- Root directory: `/` (repo root)

Shared build links (`#s=...`) work everywhere with no setup.

### Shared community list (free, works on any static host)
Uses Firebase Firestore straight from the browser (free Spark plan, no card).
1. console.firebase.google.com → **Create a project** (skip Google Analytics).
2. **Build → Firestore Database → Create database** → pick a location → **Production mode**.
3. Firestore → **Rules** tab → paste this, then **Publish**:
```
rules_version = '2';
service cloud.firestore { match /databases/{db}/documents { match /builds/{id} {
  allow read: if true;
  allow create: if request.resource.data.keys().hasOnly(['name','skills','createdAt','base','equip','author'])
    && request.resource.data.name is string && request.resource.data.name.size() > 0 && request.resource.data.name.size() <= 40
    && request.resource.data.skills is list && request.resource.data.skills.size() > 0 && request.resource.data.skills.size() <= 500
    && (!('base' in request.resource.data) || (request.resource.data.base is string && request.resource.data.base.size() <= 30))
    && (!('equip' in request.resource.data) || (request.resource.data.equip is list && request.resource.data.equip.size() <= 12))
    && (!('author' in request.resource.data) || (request.resource.data.author is string && request.resource.data.author.size() <= 30));
  allow update: if false;
  allow delete: if false;
} } }
```
4. Project settings (gear) → General → **Your apps → Web (`</>`)** → register an app → copy `projectId` and `apiKey` from the config shown.
5. Paste both into `public/js/config.js`, push to GitHub. These values are meant to be public.
Without this, Publish saves to the visitor's own browser.

**Admin mode (optional):** type the admin code anywhere on the page (not inside a text box) to toggle admin mode; Community then shows Rename and Delete buttons on each build. The typed code is the real password of a Firebase user, and only its SHA-256 is in `main.js` (`ADMIN_HASH`, `ADMIN_LEN`), so the code itself is not in the source and Firebase enforces who may rename/delete. Do not write the code in this repo (it is public).
1. Firebase console -> **Authentication -> Get started -> Sign-in method -> Email/Password -> Enable**.
2. Authentication -> **Users -> Add user**: email `admin@mythskillbuilder.app` (must match `ADMIN_EMAIL` in `js/config.js`) and your admin code as the password.
3. Firestore -> Rules: use the admin rules below (update + delete only for that email) and Publish:
```
  allow update: if request.auth != null && request.auth.token.email == 'admin@mythskillbuilder.app'
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name','author']);
  allow delete: if request.auth != null && request.auth.token.email == 'admin@mythskillbuilder.app';
```
To change the code: set the new password on that Firebase user, then put `sha256(code)` and its length in `ADMIN_HASH` / `ADMIN_LEN` (`node -e 'console.log(require("crypto").createHash("sha256").update("CODE").digest("hex"))'`).

## Where the data comes from (patch v0.21.0)
- **Names, effects, icons:** https://mythfall.wiki.gg/wiki/Skill_Tree (all 133 node types, 16x16 icons in `public/assets/icons/`). Transcribed in `tools/catalog.py`.
- **Layout and links:** read from in-game screenshots (`source/ref/`) → `source/layout.json` (grid column/row of each of the 188 nodes, Nomad = 0,0, plus the 211 links).
- `python3 tools/build-tree.py` merges the two into `public/data/tree.json` (the only file the site loads for tree data).
- When official data exists, replace `tree.json` (same shape: `nodes[{id,name,kind,icon,effect,x,y}]`, `edges[[a,b]]`) – nothing else needs to change.

## Updating items after a patch (2 steps)
1. Open https://mythfall.wiki.gg/index.php?title=Module:Data/items.json&action=raw in your browser and save it as `source/items.raw.json` (a TextEdit `.rtf` is converted automatically).
2. `python3 tools/build-items.py` -> rewrites `public/data/items.json` and downloads any new icons.
Skill tree text/icons update the same way:
1. Open https://mythfall.wiki.gg/index.php?title=Module:Data/skill-tree.json&action=raw and save it as `source/skill-tree.raw.json`.
2. `python3 tools/build-tree.py` -> refreshes names/effects/icons and tells you (lines starting with `!`) if a patch added, removed or renamed nodes.
The game data has no positions or links, so a *new* node still needs its grid position added to `source/layout.json`.

## Rules the planner implements
- Every node costs 1 skillpoint (matches the in-game "Skillpoint Cost: 1" and 7-node "Path Cost: 7").
- Hover a node: shows the cheapest path from the nearest starting node (or from nodes you already own) and its cost.
- Only a starting node, or a node next to one you own, can be bought directly; "Purchase the whole path" buys everything on the path.
- Keystones sever connections: a path can end on a keystone but never runs through one, and an owned keystone does not open the nodes around it (its other links disappear).
- Refunding a node also refunds anything cut off from your starting node.

## Layout
- `public/` – the whole website (deploy this folder)
- `public/data/tree.json` – generated tree data
- `source/` + `tools/` – reference screenshots, node layout, wiki catalogue and the generator
- `server.mjs` – local dev server only (not deployed)

## Changelog
Shown in the site (Changelog button) from `public/data/changelog.json`, newest entry first. Add an entry for every user-visible change.
