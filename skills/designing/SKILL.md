---
name: designing
description: "Use when a page, component, or visual axis changes: typography, color, spacing, motion, copy. Fires on a new visual surface, a redesign, or a surface called empty, boring, or generic. When a new visual surface does not name its displayed data, settings, or behavior, shaping decides those first; designing follows for presentation. Not for typo-only copy fixes or behavior with no visual effect."
argument-hint: <page, component or visual change>
effort: high
---

# Visual Design

Design so the result cannot be mistaken for a template: every visual choice traceable to the subject, audience, or page job, plus one evidence-backed differentiator a competitor could not justify. The enemy is the transferable default — a design that could accept another product name unchanged. The overcorrection is novelty that obscures content, removes states, or breaks accessibility.

A full or bounded redesign fails when the rendered result stays materially interchangeable with the baseline, when supporting regions stay generic while one focal point carries the design, or when a large empty area has no content, grouping, pacing, or staging job. Technical correctness never compensates for an underdesigned result. Do not default an open axis — composition, type, chromatic hierarchy, surface treatment, imagery, motion — to absence: restraint on one axis needs a brief-side reason and expression on the others.

## Size the request

**Which entry.** This skill owns the turn for a visual change at any file count, because Build dispatches its own builders. Two facts move the entry and size is not one: a surface whose displayed data, settings or behavior is not yet decided goes to `shaping` first, and this skill follows for presentation; a change that also adds non-visual behavior, meaning state, persistence, a new dependency or a network call, is owned by `implementing-batch`, which borrows this skill for the look.

- **Sketch:** a demo, prototype, or mock the request names as one: state the three Phase 1 facts and one direction in one line each, build in this session, take the piece path's post-build pair and `scripts/check-ui.mjs` run, repair what they show, and stop; no variants, agents, or reviewer, and the floor holds.
- **Full or bounded redesign:** a new page/view/identity; a request changing at least three of composition, palette, type, motion, and content hierarchy; or a report that an existing surface is empty, boring, generic, flat, unfinished, or not distinctive. Run all five phases, bounded to the named surface; the existing direction is evidence, not a veto.
- **New piece:** a section, component, or view inheriting the existing direction. With the settled identity rung 5 of `## Route` names, take the piece path: read that evidence and the Phase 1 `scripts/context.mjs` call, load `references/implementation.md` whole and, as sections, `## Adopt before authoring` and `## The state row` from `references/component-system.md` and `## Tactile hierarchy` and `## Labels` from `references/controls.md`, with `## Anatomy of the composite controls` for a composite control, build in this session, take one post-build pair with `scripts/capture.mjs` and one `scripts/check-ui.mjs` run, repair what they show, and stop; no baseline, inventory, comps, reviewer, or `scripts/inspect-render.mjs`. Without it, extract existing tokens and patterns, run every phase without variants against what the piece carries, and record one local motion decision before Build. A piece that changes the page's hierarchy is a bounded redesign, not a piece.
- **Tweak:** one element or named visual property changes and no region is added. Change it, audit the touched surface, verify the floor, and stop; never expand a tweak into a redesign.

## Route

The route decides how the direction is reached; `## Size the request` decides how much is built. Resolve the surface first from the markup and style files in the working-tree diff, then from the last touched one; with neither, ask which surface and nothing else, listing the surfaces its markup and style files name with the most recently changed first, because a request without a surface has nothing to route. Then stop at the first rung that matches, because comps earn their cost only where a chooser recognises a direction they cannot name:

1. **Tweak:** the tweak path.
2. **Handed a direction:** a plan's `Contract:` or a brief's `contract-selected.json` resumes at Build (Phase 3).
3. **Asked to choose:** the user asks to see or choose between directions, or the brief's `## Visual direction` names the user as the one who chooses between rendered directions: the offer in `## Asking`.
4. **Sketch:** the sketch path.
5. **Settled identity:** docs/design/DESIGN.md with a `scripts/context.mjs` status other than `absent`, docs/design/direction.json, a `contract-selected.json` under a run directory named for this repository, or a stylesheet, theme config or DTCG file that names both color and type values and has changed in at least one commit after the commit that added it, while neither the user nor the brief lets that identity be replaced: one direction in text and no offer. A component library in the manifest is not that evidence on its own, because its defaults are the template this skill exists to replace.
6. **Tool surface:** an open identity on an app view, dashboard, admin or settings page, form, documentation page, internal tool, or component: one direction in text from Phase 1 evidence and the nearest sibling surface where one exists, and no offer, because scanability and existing expectations outrank expression there.
7. **Expression surface:** an open identity on a landing, marketing, pricing, portfolio, or launch page, whose job is a first impression on someone who has not adopted the product: the offer in `## Asking`.

A surface neither list names takes rung 6 and the report names rung 7 as the rival reading, because the user can still ask for directions while a picker's spent minutes stay spent. A vague complaint routes the same way: it sizes the request, and the evidence picks the rung. A user who leaves the look to this skill has not asked for text: rung 7 still offers.

## The loop

Context; direction; build; critique the render; check.

## Intake

Read `references/intake.md` before Phase 1: the rule for when a question is asked at all, the run directory every render and log is written under as `$RUN`, and the table from a complaint's own words to the reference that owns the fault.

## References

Load a reference only at its row's phase and predicate; never the set up front. A row whose condition the surface does not meet stays unread. A run freezes the selection and starts Build in the turn the direction's click or exit 3 arrives, because the checked contracts are already on disk and builders return reports of at most 20 lines; after a compaction, Build reopens from `$RUN/contract-selected.json`. Phase 5 rows load in the QA pass as sections, `grep -n '^## '` finding the heading and `sed -n` reading to the next one, so the build turn carries only what its edits need. Phase 3 rows are read by the surface builder, never by this session, except `references/phase-build.md`, which decides who builds.

| File | Read it when |
|---|---|
| `references/intake.md` | Before Phase 1, for the asking rule, the run directory, and the symptom-to-reference table. |
| `builder-prompt.md` | Phase 3, before every build dispatch. |
| `references/phase-direction.md` | Phase 2, before deciding the direction. |
| `references/phase-build.md` | Phase 3, before the first edit or builder dispatch. |
| `references/phase-critique.md` | Before the first edit of a full or bounded redesign, for the baseline pair; Phase 4 before the post-build dispatch. |
| `references/visual-direction.md` | Phase 2 for every direction decision; Phase 1 when the repository or docs/design/DESIGN.md holds a design system to extract. |
| `references/sketch-tab.md` | Phase 2 on rungs 3 and 7, after `--check` reports ok and before the offer; on any other path, before the first visual choice the user asked to see. |
| `references/direction-preview.md` | Phase 2, only when the user asks to see a direction whole, before building the comps the picker shows. |
| `references/composition.md` | Phase 1 for the content inventory; Phase 2 for structure; Phase 3 for layout. |
| `references/typography.md` | Phases 2–3 only when choosing or changing type. |
| `references/controls.md` | Phase 3 before styling a button, field, menu, toggle, tab, or filter. |
| `references/implementation.md` | Phase 3 before writing CSS or component code. |
| `references/motion.md` | Phase 3 for the recorded motion decision, and before any animation at every size. |
| `references/interaction-qa.md` | Phase 3 when the surface has controls, flows, disclosure, or reachable states; Phase 5 its `## Pre-ship interaction sweep` section alone. |
| `references/feedback-and-status.md` | Phase 3 only when the surface waits on the network, applies a change before its response arrives, or reports status outside the region that changed; Phase 5 its `## Sweep` section alone. |
| `references/visual-critique.md` | Phase 4, read by the `exo:design-critic` agent; this session reads its faults.md. |
| `references/craft-recipes.md` | Phase 3 after `contract-selected.json` exists, before the first CSS of a ground, surface, motion, or type treatment. |
| `references/component-system.md` | Phase 1 only when the repository ships a component layer, its `## Adopt before authoring` section alone; Phase 3 before building a control, field, or surface the design repeats. |
| `references/tokens.md` | Phase 2 only past the role tokens `references/implementation.md` lists: a token pipeline or DTCG file in the repository, a second theme or brand, or a ramp generated against target contrast. |
| `references/icons-and-imagery.md` | Phase 3 only when the build draws or extends an icon set, places a raster or a chart, or the inventory names imagery. |
| `references/accessibility.md` | Phase 3 only before a composite widget from `references/component-system.md`; Phase 5 its `## Sweep` section alone. |
| `references/performance-budget.md` | Phase 3 only when the build adds a hero raster, a font the repository does not load, or a persistent effect; Phase 5 its `## Outcome thresholds` and `## Hard failures` sections alone. |
| `references/internationalization.md` | Phase 1 when the product ships more than one language, the repository carries translation machinery, or the audience reads a right-to-left or non-Latin script. |

## Phase 1 — Context

State three facts, defaulting absent ones: product in one sentence; audience and what they know on arrival; the page's single action or belief. Read durable design context through `scripts/context.mjs --surface <name> --needs color,typography,controls,motion`, reporting a `potentially-stale` or `unknown` status rather than resolving it silently. For a bounded redesign, record the baseline first — hierarchy, density rhythm, geometry, type contrast, surface depth, interaction emphasis — and name which the complaint is about. When the request does not name the surface's files, delegate locating its markup, styles, tokens and components to the `exo:explorer` agent and read here only the ranges under its `Read next:`, because a session that greps the tree carries that output into every later phase. Keep a list of every repository path and line range this phase read; Build hands it to each builder as `FILES`.

For a full or bounded redesign, write the content inventory and collect at least three subject observations, mapping each as `observation → visual/content behavior → repeated echo` under the rules in `references/composition.md`. Ask one question only when a missing fact materially changes scope, behavior, or a claim; never substitute a product-category aesthetic for missing evidence.

## Phase 2 — Direction

Decide the direction in this session, before any production code changes, under `references/phase-direction.md`: the contract, variants, offer, sketch tab and freeze for an open identity, and the single direction every other case produces.

## Phase 3 — Build

Read `references/phase-build.md` before the first edit or builder dispatch: where the surface builds, how builders are briefed, and what binds them. The floor, whose state, timing, and reachability mechanics live in `references/interaction-qa.md`:

- no horizontal scroll from 360px through 1440px;
- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;
- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;
- targets at least 24×24 CSS px — the WCAG 2.2 AA minimum, exempt only for sufficient spacing, an equivalent control, inline text, a user-agent default, or an essential presentation — with 44×44 as the enhanced target and the default under a coarse pointer;
- reduced-motion handling for every animation and semantic HTML beneath styling;
- reflow at 320×256 CSS px with no scrolling in two dimensions, unless the content requires a two-dimensional layout for usage or meaning;
- the largest element loading eagerly, every element above the fold reserving its space, and no persistent animation on a layout or paint property; anything costlier carries the cost disclosure `references/performance-budget.md` defines.

The underdesign floor, checked before the critique: the ground is a designed surface, not an untouched flat neutral; raised surfaces carry the direction's material, not one grey shadow each; type carries a voice through a second weight, width, or family; the recorded motion decision is built; every browser surface on the finish list in `references/implementation.md` is themed; and no slop trope from `references/visual-critique.md` stands without recorded provenance. `text-wrap: pretty`, CSS grid and subgrid, `color-mix()`, masks, and scroll-driven animation are the idiom, not enhancements to ration; the shapes live in `references/craft-recipes.md`.

## Phase 4 — Visual critique

A full or bounded redesign renders at three checkpoints under the render budget in `references/phase-critique.md`: read it before the baseline capture, which comes before the first edit.

This session produces the evidence and the agent judges it: run `scripts/capture.mjs` for the post-build pair, `scripts/check-ui.mjs` at 390x844 and 1440x900, and `scripts/inspect-render.mjs` over that pair, each redirected into `$RUN`, then dispatch `exo:design-critic` with `RUN` and `SKILL`. Those four calls cost about 20 seconds here and a third of the agent's turn budget there. The reviewer meets the fault contract in `references/visual-critique.md` — three or four faults for a redesign, one repaired rendered fault for a new piece, each naming its region, defect, evidence, target, and repairing edit. One fault may name the direction itself; its repair is a new direction, not another polish pass, so the cycle ends there: repair the other faults, take the final pair, and report the direction fault with the renders as the one open action, because a second direction, build, and critique cycle doubles the run on the critic's judgment alone.

## Phase 5 — QA

Read the `scripts/check-ui.mjs` findings for 390px and 1440px with `jq` from `$RUN/check-ui-390.json` and `$RUN/check-ui-1440.json`, repairing every `content-clipped` and `element-overlap` finding before the design is reported complete, then the interaction and accessibility sweep — including the recorded motion decision's route, the sweep in `references/accessibility.md`, and, where that file's predicate applies, the locale and RTL rerun in `references/internationalization.md` — then exercise one interactive control; the final render is this session's own capture. Report the outcome numbers from `references/performance-budget.md` beside the design, naming which were measured under throttling and which were not. A redesign is complete only when the post-build and final pairs exist under `$RUN/renders/`, with the baseline pair before them for a surface that rendered before the run, source and rendered pixels changed between consecutive checkpoints, and the fixed faults include one content or relationship fault and one craft fault. With no render path, report visual verification as blocked, name what went unchecked, and do not report the design complete. Close under the closing rule in `using-exo`: what the surface now does, the checks that ran with their results, and the one open action.

## Judgment

- Explicit brief requirements outrank every design default and tell list.
- A human selection of a rendered variant outranks this skill's own preference.
- An approved durable design decision outranks a new direction; changing one requires asking first.
- Repository framework, naming, file-layout, and component conventions outrank this skill's code defaults; they do not preserve the visual anatomy the user asked to replace.
- Scope restraint limits which surfaces and files change; it never requires the smallest visual delta inside them.
- Accessibility and complete content/state coverage outrank visual novelty.
- A brief asking for showy motion or effects raises the ambition ceiling: tells and timing caps become defaults to exceed deliberately; contrast, reduced-motion, and state coverage still hold.
- A planning turn or a `shaping` brief records the selected direction under `## Visual direction`, a plan as `Contract: docs/design/direction.json`; a plan or brief carrying one copies that contract to `$RUN/contract-selected.json`, resumes at Build (Phase 3), and repeats neither Phase 1-2 nor the variant choice.
- This skill owns visual decisions only. When a `shaping`, `planning`, `implementing-batch`, or `debug` stage called it, return control for product decisions, ordering, wiring, persistence, validation, proof, and reporting. When no stage called it, execute the visual-only request and report directly.
- After a compaction notice, resume from the files, not the conversation: the newest run directory (`ls -dt /private/tmp/designing/*/ | head -1`) holds `contract-selected.json` for the direction, `renders/` for the checkpoints reached, and the build and fault reports; docs/design/DESIGN.md fixes the durable decisions.
