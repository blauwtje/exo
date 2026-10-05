# Phase 3: Build

Build the whole page in this session by default; per-surface builders run only when the user asks for parallel builders or the full run. The enemy is a builder brief that only forwards edits this session could type. The overcorrection is skipping the capture the one pass ends with.

## The mechanics

These rules bind this session and every builder:

- The motion bar of the `motion` reference is built; a redesign or new piece that lacks it is not finished.
- When the content or the brief names a technique, such as a canvas, an instrument or generative motion, that technique is built working and live, never faked by an image, a frozen SVG or a mock that does not move.
- A component the design repeats stays unbuilt while any reachable entry of its state row has no styling.
- A surface with no existing product stays unfinished while a content obligation from the inventory is missing or any region still holds placeholder material.
- On the full run, check-ui runs before the first edit, as the baseline stage of `scripts/checkpoint.mjs --run "$RUN" --stage baseline --url <u> [--source <s>]`.
- That stage writes `$RUN/check-ui-baseline.json` covering both viewports.
- Every later stage's checkpoint call finds that file itself and passes it to check-ui as `--baseline`, so its `comparison` holds the counts the report quotes.

Where the build runs:

- The one pass builds in this session, from the plan and Phase 1 ranges.
- Only a user request for parallel builders or the full run dispatches per-surface `exo:build-ui` agents.

Proof:

- When no stage called this skill, run the repository's own type-check, lint and test commands that cover the touched files before the next `scripts/check-ui.mjs` run.
- A direct `scripts/check-ui.mjs` run prints one summary line; read it and the report's `typeSummary` (definite and blocking counts by type), not the findings.
- Open the JSON file its `report=` names only for a finding being repaired.
- Pass `--all`, which adds `target-size-enhanced` and media-query px findings to the summary, only when the user asks for AAA or breakpoint review; the report file always holds them.
- Run them once the last edit lands, here or after every builder has returned.
- A failure in a file the run did not touch is reported, not chased.
- When `build` or `find-cause` called this skill, that proof stays with the caller.

## Full run builders

- Each call is a few lines naming `RUN=<run dir> SCOPE=<foundation or a surface> SKILL=<skill dir> REPO=<repository root> FILES=$RUN/files.md REFERENCES=<the reference rows whose predicate its scope meets> URL=<the surface's url, for a surface scope that renders>`.
- `$RUN/files.md` is the Phase 1 list of paths and line ranges this session wrote, so a builder opens no whole file.
- One call with `SCOPE=foundation` writes the tokens file, the base layer, and the primitives the inventory repeats, and returns foundation.md.
- In a project with no pages and no UI framework, that call also scaffolds the stack and runs every `shadcn add` the inventory needs, because surface builders running the CLI in parallel race on `package.json`.
- This session then starts the dev server and passes its url as each surface's `URL`.
- Then, including an inventory of one or two surfaces, one call per surface goes out, all in one message, each given that same foundation.md.
- Send those calls in the turn foundation.md returns, with nothing read before it but that report, because every surface builder waits on each turn spent between the two.
- Every report is at most 20 lines; code stays on disk and this session reads the reports, not the code.

## Sizes

- **Sketch:** a demo, prototype, or mock the request names as one, built on `## The sketch path` below: no variants, agents, or critic; the floor holds.
- **New piece:** a section, component, or view inheriting the existing direction, on `## The piece path` below. A piece that changes the page's hierarchy is a bounded redesign.
- **Tweak:** one element or named visual property changes and no region is added. Change it, audit the touched surface, verify the floor, take step 4 of `## Capture, look, fix once` with `--out` under `/private/tmp/designing/`, and stop; never expand a tweak into a redesign.

## The sketch path

A sketch builds in this session with no variants, agents, or critic: state the three Phase 1 facts and one direction in one line each, build, then take `## Capture, look, fix once`.

## The piece path

A new piece on the settled identity that rung 5 of the skill's `## Route` names builds in this session, with no baseline, inventory, comps, critic, or `scripts/inspect-render.mjs`:

1. Read the rung 5 evidence `## Settled identity` of the `intake` reference lists, and the output of the Phase 1 `scripts/context.mjs` call.
2. Load the `implementation` sections the skill's References row names, skipping `## Tokens and palette derivation` unless the piece adds a role token the repository lacks.
3. Load `## Adopt before authoring` and `## The state row` from the `component-system` reference, `## Tactile hierarchy` and `## Labels` from the `controls` reference, and `## Anatomy of the composite controls` for a composite control.
4. Build, then run the repository checks `## The mechanics` names.
5. Take `## Capture, look, fix once`, and stop.

Without that identity, a new piece extracts the existing tokens and patterns, takes the one pass against what the piece carries, and writes its motion thesis in its plan.

## Capture, look, fix once

1. Run `node <skill dir>/scripts/capture.mjs --url <url> --viewport 390x844 --viewport 1440x900 --full-page --label post-build --out "$RUN/renders"`.
2. Read both captures and list each fault against the direction, the request and the floor.
3. Repair every listed fault in one pass.
4. Rerun step 1 with `--label final` and read both, because a run is done only on a capture taken after its last edit.

## Judgment

- On the full run, a final check-ui run whose `comparison.blocking` is not empty keeps the surface unfinished.
- A new `definite` finding, or any `content-clipped` or `element-overlap` finding, is repaired before the design is reported finished.
- Each `potential` entry of `comparison.new` is repaired or named in the report.
- The floor and the underdesign floor in `## The build floor` of the `phase-detail` reference bind every build, in this session and in every builder.
