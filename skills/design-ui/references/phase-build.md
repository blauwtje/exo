# Phase 3: Build

One `exo:build-ui` agent in page scope builds a page of one surface or of surfaces sharing a file. Two or more surfaces with disjoint files build in parallel. Make one call per surface; no request is needed. The enemy is a builder brief that only forwards edits this session could type. The overcorrection is skipping the capture the one pass ends with.

## The mechanics

Bind this session and every builder:

- Motion bar of the `motion` reference → built; a redesign or new piece lacking it is not finished.
- Content or brief names a technique (canvas, instrument, generative motion) → build it working and live, never faked by an image, frozen SVG or static mock.
- Repeated component → unbuilt while any reachable entry of its state row lacks styling.
- Surface with no existing product → unfinished while an inventory content obligation is missing or any region holds placeholder material.
- Full run → check-ui runs before the first edit, as the baseline stage of `scripts/checkpoint.mjs --run "$RUN" --stage baseline --url <u> [--source <s>]`.
- That stage writes `$RUN/check-ui-baseline.json` for both viewports.
- Every later checkpoint call finds that file itself and passes it to check-ui as `--baseline`, so `comparison` holds the counts the report quotes.

Where the build runs:

- Phase 1's file list splits the page into two or more surfaces with disjoint files → one `SCOPE=foundation` call first.
- Then one call per surface, all in one message, in the turn foundation.md returns, per `## Full run builders`.
- `FILES` is the Phase 1 path list; this session captures, looks and judges.
- One surface or shared files → one `exo:build-ui` page scope, from the plan and Phase 1 ranges; this session captures, looks and judges.

Proof: `## Proof` of the `build-pass` reference, plus:

- The repository checks of that `## Proof` → before the next `scripts/check-ui.mjs` run.
- Direct `scripts/check-ui.mjs` run → read its one summary line and the report's `typeSummary` (definite and blocking counts by type), not the findings.
- `--all` adds `target-size-enhanced` and media-query px findings to the summary → pass it only when the user asks for AAA or breakpoint review; the report file always holds them.
- Run proof once the last edit lands, here or after every builder has returned.

## Full run builders

- Each call: a few lines naming `RUN=<run dir> SCOPE=<foundation or a surface> SKILL=<skill dir> REPO=<repository root> FILES=$RUN/files.md REFERENCES=<the reference rows whose predicate its scope meets> URL=<the surface's url, for a surface scope that renders>`.
- `$RUN/files.md` = Phase 1 list of paths and line ranges this session wrote, so a builder opens no whole file.
- One call with `SCOPE=foundation` writes the tokens file, base layer and the primitives the inventory repeats, and returns foundation.md.
- Project with no pages and no UI framework → that call also scaffolds the stack and runs every `shadcn add` the inventory needs, because parallel surface builders running the CLI race on `package.json`.
- This session then starts the dev server and passes its url as each surface's `URL`.
- Then one call per surface, all in one message, each given that foundation.md, even for an inventory of one or two surfaces.
- Send them in the turn foundation.md returns, reading nothing but that report first; every surface builder waits on each turn between.
- Every report at most 20 lines; code stays on disk; this session reads reports, not code.

## Sizes

- **Sketch:** a demo, prototype or mock the request names as one, on `## The sketch path`: no variants, agents or critic; the floor holds.
- **New piece:** a section, component or view inheriting the existing direction, on `## The piece path`. A piece that changes the page's hierarchy is a bounded redesign.
- **Tweak:** one element or named visual property changes, no region added. Change it, audit the touched surface, verify the floor, take step 4 of `## Capture, look, fix once` with `--out` under `/private/tmp/designing/`, stop; never expand a tweak into a redesign.

## The sketch path

Build in this session, no variants, agents or critic: state the three Phase 1 facts and one direction, one line each, build, then take `## Capture, look, fix once`.

## The piece path

A new piece on the settled identity that rung 5 of the skill's `## Route` names builds in this session, with no baseline, inventory, comps, critic or `scripts/inspect-render.mjs`:

1. Read the rung 5 evidence `## Settled identity` of the `intake` reference lists, and the Phase 1 `scripts/context.mjs` output.
2. Load the `implementation` sections the skill's References row names; skip `## Tokens and palette derivation` unless the piece adds a role token the repository lacks.
3. Load `## Adopt before authoring` and `## The state row` from the `component-system` reference, `## Tactile hierarchy` and `## Labels` from the `controls` reference, and `## Anatomy of the composite controls` for a composite control.
4. Build, then run the repository checks `## The mechanics` names.
5. Take `## Capture, look, fix once`, and stop.

No settled identity → extract the existing tokens and patterns, take the one pass against what the piece carries, and write its motion thesis in its plan.

## Capture, look, fix once

1. Run `node <skill dir>/scripts/capture.mjs --url <url> --viewport 390x844 --viewport 1440x900 --full-page --label post-build --out "$RUN/renders"`.
2. Read both captures; list each fault against the direction, the request, a named or saved product's finish and the floor.
3. Repair every listed fault in one pass; on the one pass, `SendMessage` the list to the builder instead.
4. Rerun step 1 with `--label final` and read both; a run is done only on a capture taken after its last edit. Later changes go to the builder that built the page.

Read only the post-build and final pairs, never a state capture; a fault under repair adds one.

Page does not render, or capture exits non-zero → report capture blocked, naming what went unchecked.

## Judgment

- Full run → final check-ui `comparison.blocking` not empty keeps the surface unfinished.
- A new `definite` finding, or any `content-clipped` or `element-overlap` finding, is repaired before the design is reported finished.
- Each `potential` entry of `comparison.new` → repaired or named in the report.
- `## The build floor` of the `build-pass` reference binds every build, in this session and in every builder.
