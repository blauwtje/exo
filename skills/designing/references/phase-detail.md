# Phase detail

The per-phase detail the skill body no longer carries: what Phase 1 establishes, the floor a build may not go under, the four calls made before the critic judges, and what the QA sweep covers. The enemy is a phase whose detail sits in the always-read body and is paid for by every run, including the tweak that needs none of it. The overcorrection is a phase reduced to its name, which builds whatever the session felt like building.

## Context

State three facts, defaulting absent ones: product in one sentence; audience and what they know on arrival; the page's single action or belief. Read durable design context through `scripts/context.mjs --surface <name> --needs color,typography,controls,motion`, reporting a `potentially-stale` or `unknown` status rather than resolving it silently. When the request does not name the surface's files, delegate locating its markup, styles, tokens and components to the `exo:explorer` agent and read here only the ranges under its `Read next:`, because a session that greps the tree carries that output into every later phase. Keep a list of every repository path and line range this phase read; Build hands it to each builder as `FILES`.

A full or bounded redesign runs none of this here: the `exo:design-discovery` agent collects it, with the baseline record, the content inventory and at least three subject observations, into `$RUN/inventory.md` and `$RUN/files.md`, and Build hands `$RUN/files.md` to each builder as `FILES`. Ask one question only when a missing fact materially changes scope, behavior, or a claim, including an `## Open` line the agent returns; never substitute a product-category aesthetic for missing evidence.

## The build floor

- no horizontal scroll from 360px through 1440px;
- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;
- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;
- targets at least 24×24 CSS px — the WCAG 2.2 AA minimum, exempt only for sufficient spacing, an equivalent control, inline text, a user-agent default, or an essential presentation — with 44×44 as the enhanced target and the default under a coarse pointer;
- reduced-motion handling for every animation and semantic HTML beneath styling;
- reflow at 320×256 CSS px with no scrolling in two dimensions, unless the content requires a two-dimensional layout for usage or meaning;
- the largest element loading eagerly, every element above the fold reserving its space, and no persistent animation on a layout or paint property; anything costlier carries the cost disclosure `performance-budget.md` defines.

The underdesign floor, checked before the critique: the ground is a designed surface, not an untouched flat neutral; raised surfaces carry the direction's material, not one grey shadow each; type carries a voice through a second weight, width, or family; the recorded motion decision is built; every browser surface on the finish list in `implementation.md` is themed; and no slop trope from `visual-critique.md` stands without recorded provenance. `text-wrap: pretty`, CSS grid and subgrid, `color-mix()`, masks, and scroll-driven animation are the idiom, not enhancements to ration; the shapes live in `craft-recipes.md`.

## The critique dispatch

This session produces the evidence and the agent judges it: run `scripts/capture.mjs` for the post-build pair, `scripts/check-ui.mjs` at 390x844 and 1440x900, and `scripts/inspect-render.mjs` over that pair, each redirected into `$RUN`, then dispatch `exo:design-critic` with `RUN` and `SKILL`. Those four calls cost about 20 seconds here and a third of the agent's turn budget there. The reviewer meets the fault contract in `visual-critique.md` — three or four faults for a redesign, one repaired rendered fault for a new piece, each naming its region, defect, evidence, target, and repairing edit. One fault may name the direction itself; its repair is a new direction, not another polish pass, so the cycle ends there: repair the other faults, take the final pair, and report the direction fault with the renders as the one open action, because a second direction, build, and critique cycle doubles the run on the critic's judgment alone.

## QA

Read the `scripts/check-ui.mjs` findings for 390px and 1440px with `jq` from `$RUN/check-ui-390.json` and `$RUN/check-ui-1440.json`, repairing every `content-clipped` and `element-overlap` finding before the design is reported complete, then the interaction and accessibility sweep — including the recorded motion decision's route, the sweep in `accessibility.md`, and, where that file's predicate applies, the locale and RTL rerun in `internationalization.md` — then exercise one interactive control; the final render is a capture this pass takes itself. Report the outcome numbers from `performance-budget.md` beside the design, naming which were measured under throttling and which were not. A redesign is complete only when the post-build and final pairs exist under `$RUN/renders/`, with the baseline pair before them for a surface that rendered before the run, source and rendered pixels changed between consecutive checkpoints, and the fixed faults include one content or relationship fault and one craft fault. With no render path, report visual verification as blocked, name what went unchecked, and do not report the design complete. Close under the closing rule in `using-exo`: what the surface now does, the checks that ran with their results, and the one open action.

## Judgment

- The floor outranks the direction: a surface that misses contrast, reflow, reduced motion or target size is not finished, whatever it looks like.
- A measured number outranks an estimate, and a check that was not measured is reported as not measured.
- One critique cycle outranks a second: a fault against the direction itself ends the cycle and is reported, never polished around.
