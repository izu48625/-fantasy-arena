# FANTASY ARENA V37 — Phase23 Split Preparation

Updated: 2026-10-08  
Baseline branch: `main`  
Phase22 formal baseline: `1985734a790e497c667396800341c216f1e2a402`

## Goal

Make the 2.9 MB single-file build maintainable **without changing gameplay, SAVE/LOAD compatibility, browser behavior, or the published GitHub Pages contract**.

Phase23 does **not** begin by serving many runtime files. The safe first target is:

> split the source for development, then rebuild the same single `index.html` in the exact original order.

Only after byte/behavior parity is stable should runtime external CSS/JS be considered.

## Current architecture audit

Current `main/index.html` at the Phase22 baseline:

- GitHub file size: about **2,934,894 bytes**
- `<style>` blocks: **76**
- `<script>` blocks: **155**
- blocks after the first `</html>`: **24 style + 21 script**
- static HTML IDs: **no duplicate IDs detected**
- inline JS syntax: **155 / 155 passed** in the Phase22 final audit
- `viewport-fit=cover`: present
- Phase22 formal/readability/mobile markers: present

The late blocks after the first `</html>` are intentional legacy behavior. They are part of the current cascade/evaluation order and must not be moved casually.

### High-risk override hotspots

The current build intentionally redefines/wraps global functions many times. Approximate definition/reassignment counts from the baseline audit include:

| Symbol | Count |
| --- | ---: |
| `loadGameState` | 31 |
| `openPlayerModal` | 30 |
| `initGame` | 23 |
| `updateUI` | 22 |
| `switchTab` | 19 |
| `getFinanceSnapshot` | 15 |
| `renderMyRoster` | 15 |
| `buildSaveData` | 12 |
| `openClubManagePanel` | 11 |
| `renderTournamentSelectionTable` | 8 |
| `simulateBattle` | 8 |
| `renderLegendRegistryPanel` | 7 |

This means naive JS extraction/reordering is unsafe. **Evaluation order is part of the program.**

## Non-negotiable invariants

Every Phase23 step must preserve:

1. Existing SAVE / LOAD compatibility.
2. Game balance and battle/growth/finance/AI/FCL/King's Cup/Sky Arena logic unless separately requested.
3. Global override order.
4. DOM availability timing for scripts that execute immediately.
5. CSS cascade order, especially Phase22 tail overrides.
6. iPhone Safari behavior and safe-area handling.
7. GitHub Pages entrypoint: `/index.html`.
8. Current Phase22 formal baseline markers until a new formal baseline is declared.

## Phase23 migration strategy

### M1 — Audit + guardrails — DONE

Add:

- `docs/PHASE23_SPLIT_PLAN.md`
- `tools/phase23-audit.mjs`

The audit tool checks:

- inline JS parse errors
- duplicate static IDs
- critical Phase22 markers
- `viewport-fit=cover`
- critical UI IDs/tokens
- missing local external refs
- late block counts
- global override hotspots

Usage:

```bash
node tools/phase23-audit.mjs index.html --strict
node tools/phase23-audit.mjs index.html --json
```

### M2 — Ordered source manifest

Create a source tree without changing runtime output:

```text
src/
  manifest.json
  fragments/
  styles/
  scripts/
tools/
  build.mjs
  phase23-audit.mjs
index.html   # generated/published artifact
```

`src/manifest.json` will define the **exact concatenation order** of HTML fragments, style blocks, and script blocks.

Rules:

- do not move a block relative to another block
- do not rename globals
- do not deduplicate CSS yet
- do not merge wrappers/overrides yet
- preserve comments/markers used as migration anchors

### M3 — CSS source split

Extract CSS into source files while the build step re-inlines it at the original locations/order.

Initial grouping target:

```text
src/styles/
  00-base.css
  10-legacy.css
  20-feature.css
  80-phase22-core.css
  90-phase22-overrides.css
  99-safari-hotfix.css
```

The first pass is organizational only. No selector cleanup or cascade simplification in the same commit.

### M4 — JS source split

Extract scripts in **current evaluation order**. Keep wrapper chains intact.

Suggested source domains:

```text
src/scripts/
  core/
  save/
  league/
  match/
  market/
  draft/
  tournament/
  fcl/
  sky/
  club/
  records/
  offseason/
  ui/
  phase22/
```

Important: domain folders are for maintainability; `manifest.json` determines execution order. Folder name must never be used to infer load order.

### M5 — Reproducible build parity

`tools/build.mjs` must rebuild `index.html` deterministically.

Before accepting M5:

- build twice -> identical SHA-256
- generated `index.html` -> Phase23 audit PASS
- all inline scripts parse
- no duplicate static IDs
- formal markers preserved
- functional smoke test PASS
- existing save imports/loads successfully

During M2-M5, **GitHub Pages continues to serve one generated `index.html`**. This avoids changing Safari network/loading behavior while source maintainability improves.

### M6 — Optional runtime externalization

Only after the generated single-file build is stable should we decide whether production should actually load external CSS/JS.

This is optional. A maintainable split source + generated single HTML may remain the final architecture if it proves more robust for the game.

## Recommended extraction order

Lowest-risk first:

1. documentation/tooling only
2. Phase22 CSS source blocks
3. older CSS blocks
4. isolated UI-only JS wrappers
5. feature-specific JS with no immediate DOM timing dependency
6. save/load and initialization chain
7. match engine / season progression last

The save/load/init chain should be among the **last** areas migrated because it has the densest override history.

## Commit discipline

For every extraction commit:

1. fetch current `main`
2. run `node tools/phase23-audit.mjs index.html --strict`
3. extract only one coherent block/group
4. rebuild `index.html`
5. run audit again
6. run functional smoke checks
7. commit only if behavior is unchanged

Do not combine extraction with cleanup/refactoring. **Move first, refactor later.**

## Phase23 M1 status

M1 establishes the safety rails only. `index.html` remains untouched, so:

- gameplay logic: unchanged
- SAVE format: unchanged
- UI behavior: unchanged
- GitHub Pages behavior: unchanged

Next task: **M2 ordered source manifest + deterministic build skeleton.**
