# CLAUDE.md — Zuar Portal Block Builder

Guidance for future Claude sessions working on this repo. Goal of the current
branch (`claude/upgrade-portal-1.18-c0Voe`) is to upgrade the Block Builder to
**Zuar Custom Portal 1.18.0** — adopting the new multi-query / `queryResults`
model — without breaking blocks authored under 1.16/1.17.

---

## 1. What this repo actually is

Two files at the repo root:

```
Zuar-Portal-Block-Builder/
  README.md         ← one-liner
  blockbuilder.zip  ← the entire Block Builder app, zipped
```

**All real code lives inside `blockbuilder.zip`.** Extract it locally to
`blockbuilder_extracted/` (gitignored) for inspection or editing; the zip is
the source of truth and must be rebuilt when code changes.

Contents of the zip (top level):

```
blockbuilder/
  server.js           ← Express proxy + auth, listens on :3131
  server.py           ← older Python version of the same (legacy — ignore unless asked)
  index.html          ← ~1950-line single-page app (the UI)
  package.json        ← cors + express
  config.json         ← Portal/GitHub/Anthropic credentials (NEVER commit)
  gitignore           ← shipped without the leading dot (!); lists config.json
  start.sh
  skills/
    zportal.md
    currentblock.md
    currentBlock-instruction-set.md
    amcharts5.md
    rest-api.md
    savedfilters      (extensionless; reference data)
```

### What it does

1. Runs locally at `http://localhost:3131`.
2. Logs into a Zuar portal on startup with `GET /auth/login?api_key=…&user_id=…`
   and caches the JWT cookie (`server.js` lines 36–90).
3. Proxies the browser app's calls through `/api/proxy/*` → `{portalUrl}/*`
   (re-logs on 401; `server.js` lines 215–290).
4. Serves `index.html`, a full Block Builder UI: list/search/filter blocks,
   create/edit/duplicate/delete, push each block to GitHub with per-block
   history + diff + restore, and generate block code via the Anthropic API.
5. Proxies a `/api/anthropic` endpoint to Claude for AI block authoring, with
   skill files + custom rules assembled into a system prompt.

### Repo convention

- Branch: `claude/upgrade-portal-1.18-c0Voe` (feature branch for this upgrade).
- Open PR: https://github.com/patrickdeanfox/Zuar-Portal-Block-Builder/pull/1 (draft).
- When code inside the zip changes, re-zip and replace `blockbuilder.zip`.
  Do not add the extracted tree to git — `blockbuilder_extracted/` is in
  `.gitignore`.

---

## 2. Security — read this before any commit

`blockbuilder.zip` currently bundles a `config.json` with live credentials:

- Portal API key (`2vECewhSmub5…`)
- GitHub personal access token (`ghp_80wCje90…`)
- Anthropic API key (`sk-ant-api03-OIhBdSY…`)

**Treat those three as leaked.** Rotate all three and rebuild the zip with a
placeholder `config.json` before this branch merges to `main`. The root
`.gitignore` now excludes `config.json` directly, but the zip predates that
rule, so git history still contains the secrets — plan a history rewrite
(`git filter-repo`) or accept rotation-only.

---

## 3. Target: Zuar Portal 1.18 — confirmed vs. unconfirmed

**The official docs (https://www.zuar.com/docs/portal/1.18.0/…) return HTTP
403 from this sandbox** — they are gated behind a login. Every 1.18 fact
below is split into CONFIRMED (from the public blog post
`zuar.com/blog/zuar-portal-v-1-18/`) and INFERRED (educated guess from the
blog + existing 1.17 shape — must be verified against a real 1.18 portal or
the gated migration page before committing writer code).

### 3a. CONFIRMED 1.18 changes

- `currentBlock` is **extended, not replaced**:
  - `currentBlock.queryResults` — array, one entry per configured query.
  - `currentBlock.currentUser` — user context for conditional UI.
  - `currentBlock.theme`, `currentBlock.system`, `currentBlock.config` —
    theming and system context.
  - `currentBlock.getOnLoadedCallback()` — invoke when async render is done.
  - `currentBlock.getOnAnimatedCallback()` — invoke when animations complete
    (lets Portal export clean PNGs/PDFs).
- HTML blocks support **multiple SQL-based queries per block**.
- **Legacy shortcuts still work**: `currentBlock.data` and `currentBlock.query`
  are documented as aliases for "the first query". Blocks written for 1.17
  will keep rendering. New code should prefer `queryResults[i]`.
- `POST /api/datasources/{id}/data` with `{ filters, queries: [...] }` is
  **unchanged** — the 1.17 body was already multi-query-shaped.

### 3b. NOT CONFIRMED (must verify against a live 1.18 portal)

- The exact on-the-wire shape of a multi-query block payload. Likely:
  ```jsonc
  "data": {
    "queries": [
      { "data_source": "<uuid>", "columns": ["*"], "limit": 500, "where": "…" }
    ]
  }
  ```
  with the 1.17 single-query shape `{ "__source__": "<uuid>", "columns": […] }`
  still accepted as a shortcut for `queries[0]`.
- Whether `__source__` is renamed to `data_source` at the block-config layer.
  The 1.17 query object used `__source__`; the 1.18 blog uses the phrase
  "data source" conversationally — this is not verified.
- Whether `zPortal.dataSource.fetchResults(...)` and
  `zPortal.dataSource.on('load', dsId, …)` are hard-deprecated. No public
  evidence of removal. Treat them as still supported; prefer
  `getOnLoadedCallback()` for render completion signalling.
- Any REST endpoint renames. None are announced in the public release notes.
  Treat `/api/blocks`, `/api/datasources`, `/auth/login`, `/auth/me`,
  `/api/db_modifications/*` as unchanged.

### 3c. How to close the gaps

Fastest path (ranked):

1. Open `/docs/portal/1.18.0/Reference/Migrations/1.18.0/` in a logged-in
   browser and paste the relevant schema sections into this file — replace
   §3b items with confirmed quotes.
2. Against a live 1.18 portal: `GET /api/proxy/api/version`, then
   `GET /api/proxy/api/blocks/{id}` on a block that has multiple queries
   configured in the UI. Record the exact JSON. That locks down §3b.1 and §3b.2.
3. In a browser console on a 1.18 portal page: `console.log(currentBlock)` and
   record top-level keys. That confirms §3a completeness.

---

## 4. Where 1.17 assumptions live in this code

Every place the Block Builder assumes a single-query block shape:

| File | Line | What it assumes |
|---|---|---|
| `blockbuilder/index.html` | 614 | `meta.json` stores `source_id: block.data.__source__` |
| `blockbuilder/index.html` | 1054–1055 | AI-gen template reads `currentBlock.data.columns` / `data` |
| `blockbuilder/index.html` | 1279 | Data preview reads `block.data.__source__` |
| `blockbuilder/index.html` | 1288 | `POST /api/datasources/{dsId}/data` — already multi-query-shaped |
| `blockbuilder/index.html` | 1444–1448 | Save/update payload spreads `currentBlock.data` verbatim |
| `blockbuilder/index.html` | 1482–1487 | Duplicate uses same `data` |
| `blockbuilder/index.html` | 1882–1884 | Default `custom_rules` pin `currentBlock.data.data` / `.columns` |
| `blockbuilder/config.json` | rules 1,2,5 | Same pins — 3 of 9 rules |
| `blockbuilder/skills/currentblock.md` | all | 1.17 shape is THE shape |
| `blockbuilder/skills/currentBlock-instruction-set.md` | all | 1.17 shape only |
| `blockbuilder/skills/zportal.md` | line 20 | Self-labels as "v1.16.x" |
| `blockbuilder/skills/rest-api.md` | block-body example | Single-query `data` shape |

`server.js` and `server.py` are transport-only and need no changes.

---

## 5. Upgrade plan (check off as you go)

Gated by §3c verification for writer-side changes; reader-side changes are
safe to make immediately because 1.18 keeps the legacy shortcuts.

### Reader-side (safe now — additive, no shape guessing)

- [ ] `skills/currentblock.md` — add a "1.18 canonical pattern" section using
      `queryResults[0]` and keep the existing patterns under "Legacy
      shortcuts (still works in 1.18)".
- [ ] `skills/currentBlock-instruction-set.md` — same structure: add a
      `queryResults[]` shape block at the top, retain the 1.17 detail as
      legacy reference.
- [ ] `skills/zportal.md` — bump version header from "v1.16.x" to "v1.18.x",
      add `currentBlock.queryResults`, `.currentUser`, `.theme`, `.system`,
      `.config`, `.getOnLoadedCallback()`, `.getOnAnimatedCallback()` to the
      API quick-reference.
- [ ] Add a `skills/queries-and-datasources.md` section OR expand
      `skills/zportal.md` with a "Multi-query HTML blocks" worked example
      (two queries, `queryResults[0]` and `[1]` rendered into two charts).
- [ ] `config.json` `custom_rules` — rewrite rules 1, 2, 5 to prefer
      `currentBlock.queryResults[i]` while noting that `currentBlock.data`
      still works. Add a new rule: "Call `currentBlock.getOnLoadedCallback()()`
      after async render and `getOnAnimatedCallback()()` after animations."
- [ ] `index.html` template strings at lines 1054–1055 and 1882–1884 —
      ship 1.18-first snippets; keep 1.17 commented as fallback.

### Writer-side (gated on §3c verification)

- [ ] Decide on the canonical multi-query shape (per §3b.1). Likely
      `block.data = { queries: [ { data_source, columns, limit, where, ... }, ... ] }`.
- [ ] Add normalizers in `index.html`:
      ```js
      function toV18Data(d) {
        if (!d) return { queries: [] };
        if (Array.isArray(d.queries)) return d;
        if (d.__source__) {
          const { __source__, ...rest } = d;
          return { queries: [{ data_source: __source__, ...rest }] };
        }
        return d;
      }
      function firstQuery(d) {
        return (d?.queries?.[0]) || d || {};
      }
      ```
- [ ] Replace the 5 `block.data.__source__` / raw `block.data` touch-points
      listed in §4 with `firstQuery(block.data).data_source` / `toV18Data(...)`
      so the UI reads both shapes and writes the new one.
- [ ] Extend the block-edit drawer: replace the single `__source__ / columns /
      where / limit / group_by / order_by / distinct` form with a
      "queries" list — one card per query, "Add query" / "Remove query"
      buttons. Keep a read-only "Legacy (1.17) single-query view" for old
      blocks that have never been re-saved.
- [ ] Data-preview panel: iterate `queries[]`, show one result tab per query.
- [ ] GitHub sync (`meta.json` writer at `index.html:614`): store
      `source_ids: [uuid, uuid, ...]` instead of a single `source_id`, and
      keep the full `queries[]` under a `queries` key for readable diffs.
      Optional: add per-query files under `blocks/…/queries/{i}.json`.
- [ ] Version gate: before accepting multi-query edits, call
      `GET /api/proxy/api/version` and refuse to save `queries.length > 1`
      against a portal older than `1.18.0` (preventing silent data loss).

### REST / proxy / auth

- [ ] No code changes expected in `server.js`. Bump only the startup banner
      wording to "Block Builder for Portal 1.18".
- [ ] Keep `/auth/login?api_key=…&user_id=…` flow as-is (unchanged in 1.18
      per current public info).

### Verification / release gate

- [ ] Resolve every **NOT CONFIRMED** item in §3b against a live 1.18 portal
      or the gated migration page. Patch CLAUDE.md with confirmed quotes.
- [ ] Re-author one HTML block and one amchart block in the UI and confirm
      they render on a 1.18 portal page via `queryResults[0]`.
- [ ] Re-zip: `cd blockbuilder_extracted && zip -r ../blockbuilder.zip blockbuilder
      -x 'blockbuilder/node_modules/*' -x 'blockbuilder/config.json'` and
      commit the regenerated `blockbuilder.zip` at the repo root.
- [ ] Rotate the three leaked credentials (§2) and scrub or rebuild history.
- [ ] Flip PR #1 out of draft.

---

## 6. Ground rules for editing the code inside `blockbuilder.zip`

- Always work in `blockbuilder_extracted/` (gitignored). When done, rezip and
  replace `blockbuilder.zip` at the repo root — that is the only tracked
  deliverable for code changes.
- Never commit `blockbuilder_extracted/blockbuilder/config.json` (live keys)
  or `blockbuilder_extracted/blockbuilder/node_modules/`. The rebuild command
  above excludes both.
- Before changing any block-shape assumption, re-read §3b and §4. If what you
  need to change is in the §3b unconfirmed list, either (a) verify against a
  live 1.18 portal first, or (b) write it as a normalizer with both shapes
  handled and a `TODO(1.18-verify)` comment.
- Keep 1.17 compatibility reader-side. Legacy blocks must keep rendering even
  after the Block Builder itself is 1.18-native.

---

## 7. Quick reference — 1.17 vs 1.18 reader code

```js
// 1.17 (still works in 1.18 as a shortcut to queryResults[0])
const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
const rows = currentBlock?.data?.data || [];
const dsId = currentBlock?.query?.__source__;

// 1.18 preferred (multi-query safe)
const r0   = currentBlock?.queryResults?.[0];
const cols = (r0?.columns || []).map(c => c.name);
const rows = r0?.data || [];
const dsId = currentBlock?.queries?.[0]?.data_source      // 1.18 shape (unconfirmed)
          ?? currentBlock?.query?.__source__;             // 1.17 fallback

// Lifecycle (1.18 only — opt-in, important for exports)
const onLoaded   = currentBlock.getOnLoadedCallback?.();
const onAnimated = currentBlock.getOnAnimatedCallback?.();

// Reactive re-render (unchanged signature in 1.18)
zPortal.dataSource.on('load', dsId, payload => {
  const rows = payload?.results?.[0]?.data || [];
  render(rows);
  onLoaded?.();
});
```

---

## 8. Sources

- https://www.zuar.com/blog/zuar-portal-v-1-18/  (public blog — only fully
  fetchable 1.18 reference from this sandbox)
- https://www.zuar.com/help/custom-portal/system-js-api/  (help root, latest)
- https://www.zuar.com/help/custom-portal/block-types-overview/
- https://www.zuar.com/release-notes/custom-portal/release/1.18.0/  (403 from
  sandbox; must be read in-browser)
- https://www.zuar.com/docs/portal/1.18.0/  (403)
- https://www.zuar.com/docs/portal/1.18.0/Reference/Migrations/1.18.0/  (403 —
  this is the authoritative migration guide; paste its contents here once you
  have access)
