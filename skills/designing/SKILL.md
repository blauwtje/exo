---
name: designing
description: "Use for a page, view, component, or visual axis: composition, typography, color, spacing, responsive behavior, motion, copy, styling architecture. Fires on a new visual surface, a redesign, a surface reported as empty, boring, or generic, a new piece in an existing design, or a visual or code-quality change to existing UI. When a new visual surface does not name its displayed data, settings, or behavior, shaping decides those first; designing follows for presentation. Not for typo-only copy fixes, or data flow, persistence, validation, or behavior with no visual effect."
effort: high
---

# Visual Design

Design so the result cannot be mistaken for a template: every visual choice traceable to the subject, audience, or page job, plus one evidence-backed differentiator a competitor could not justify. The enemy is the transferable default — a design that could accept another product name unchanged. The overcorrection is novelty that obscures content, removes states, or breaks accessibility.

A full or bounded redesign fails when the rendered result stays materially interchangeable with the baseline, when supporting regions stay generic while one focal point carries the design, or when a large empty area has no content, grouping, pacing, or staging job. Technical correctness never compensates for an underdesigned result. Do not default an open axis — composition, type, chromatic hierarchy, surface treatment, imagery, motion — to absence: restraint on one axis needs a brief-side reason and expression on the others.

## Size the request

- **Sketch:** a demo, prototype, or mock the request names as one: state the three Phase 1 facts and one direction in one line each, build in this session, take the piece path's post-build pair and `scripts/check-ui.mjs` run, repair what they show, and stop; no variants, agents, or reviewer, and the floor holds.
- **Full or bounded redesign:** a new page/view/identity; a request changing at least three of composition, palette, type, motion, and content hierarchy; or a report that an existing surface is empty, boring, generic, flat, unfinished, or not distinctive. Run all five phases, bounded to the named surface; the existing direction is evidence, not a veto.
- **New piece:** a section, component, or view inheriting the existing direction. With a settled direction artifact — docs/design/DESIGN.md, docs/design/direction.json, a `contract-selected.json` in a run directory, or a tokens file the repository ships — take the piece path: read that artifact and the Phase 1 `scripts/context.mjs` call, load `references/implementation.md` whole and, as sections, `## Adopt before authoring` and `## The state row` from `references/component-system.md` and `## Tactile hierarchy` and `## Labels` from `references/controls.md`, with `## Anatomy of the composite controls` for a composite control, build in this session, take one post-build pair with `scripts/capture.mjs` and one `scripts/check-ui.mjs` run, repair what they show, and stop; no baseline, inventory, comps, reviewer, or `scripts/inspect-render.mjs`. Without such an artifact, extract existing tokens and patterns, run every phase without variants against what the piece carries, and record one local motion decision before Build. A piece that changes the page's hierarchy is a bounded redesign, not a piece.
- **Tweak:** one element or named visual property changes and no region is added. Change it, audit the touched surface, verify the floor, and stop; never expand a tweak into a redesign.

## The loop

Context; direction; build; critique the render; check.

## Run directory

Every run past a tweak writes under one directory outside the repository, `/private/tmp/designing/<repository basename>-<YYYYMMDD-HHMM>/`, called `$RUN` below, created before Phase 1 and named once in the transcript. It holds `context.json`, `contracts.json`, `contract-selected.json`, `font-candidates.json`, `variant-<n>/`, `renders/`, and the run reports inventory.md, foundation.md, `build-<surface>.md`, faults.md and verdict.md. Every `node scripts/*.mjs` call redirects stdout into `$RUN` and the session reads the fields it needs with `jq` or `sed -n`, never the whole file: a JSON line that lands in the transcript is re-read on every later turn. `direction.mjs --select` prints the frozen contract; the redirect into `$RUN/contract-selected.json` is what writes it. Agents receive `$RUN` and exchange files under it; they return reports, never file contents.

## Asking

Name the decision an answer changes before asking anything; a question with no named decision is not asked. Taste is never that decision: palette, typeface, and which product the user likes the look of are settled by the direction contract and shown as rendered comps, never polled.

- A one-line brief is not a reason to ask. Derive the three Phase 1 facts, state them in one line as assumptions, and build.
- An open identity offers the picker once, and renders nothing before the answer. The offer is its own message, sent at the point where the direction is the open question, and it carries three facts in the conversation's own language: the directions open as rendered comps in a browser tab, building them costs more tokens than settling the direction in text, and one click ends it. An offer that drops the cost is not the offer, because a chooser who was not told the price did not agree to it. A yes opens `pick.mjs` in the next turn and builds the comps into the seats it is already holding; a no, or an exit 3, makes the `--recommend` contract the selection, with no further question to the terminal. Nothing else is asked through the browser: scope, content, data and behavior are terminal questions, because a question about a visual topic is not a visual question.
- Beyond that, ask only while an unanswered fact blocks a decision the brief, the repository, and Phase 1 evidence cannot settle, and name that decision inside the question. Stop after two rounds, then state the assumption and build.
- A planning turn asks nothing and builds no comp: write the space file, deal `--plan --seed <token> --space <file> --variants 2`, keep and fill one contract, `--check` it, freeze it with `--select --index 0`, and carry that output verbatim in the Edit block of the plan's first Build step, which writes docs/design/direction.json.

## References

Load a reference only at its row's phase and predicate; never the set up front. A row whose condition the surface does not meet stays unread. A run whose picker opened ends that turn at the `--select` freeze and Build reopens from `$RUN/contract-selected.json` in the next, because the comps and the renders together exceed one turn's budget; a run with one direction goes on to Build in the same turn. Phase 5 rows load in the QA pass as sections, `grep -n '^## '` finding the heading and `sed -n` reading to the next one, so the build turn carries only what its edits need. Phase 3 rows are read by the surface builder, never by this session.

| File | Read it when |
|---|---|
| `builder-prompt.md` | Phase 3, before every build dispatch. |
| `critic-prompt.md` | Phase 4, before the post-build dispatch. |
| `references/visual-direction.md` | Phase 2 for every direction decision; Phase 1 when the repository or docs/design/DESIGN.md holds a design system to extract. |
| `references/direction-preview.md` | Phase 2 for an open identity, after `--check` reports ok and before building the comps the picker shows. |
| `references/composition.md` | Phase 1 for the content inventory; Phase 2 for structure; Phase 3 for layout. |
| `references/typography.md` | Phases 2–3 only when choosing or changing type. |
| `references/controls.md` | Phase 3 before styling a button, field, menu, toggle, tab, or filter. |
| `references/implementation.md` | Phase 3 before writing CSS or component code. |
| `references/motion.md` | Phase 3 for the recorded motion decision, and before any animation at every size. |
| `references/interaction-qa.md` | Phase 3 when the surface has controls, flows, disclosure, or reachable states; Phase 5 its `## Pre-ship interaction sweep` section alone. |
| `references/feedback-and-status.md` | Phase 3 only when the surface waits on the network, applies a change before its response arrives, or reports status outside the region that changed; Phase 5 its `## Sweep` section alone. |
| `references/visual-critique.md` | Phase 4, read by the critic dispatched from `critic-prompt.md`; this session reads its faults.md. |
| `references/craft-recipes.md` | Phase 3 after `contract-selected.json` exists, before the first CSS of a ground, surface, motion, or type treatment. |
| `references/component-system.md` | Phase 1 only when the repository ships a component layer, its `## Adopt before authoring` section alone; Phase 3 before building a control, field, or surface the design repeats. |
| `references/tokens.md` | Phase 2 only past the role tokens `references/implementation.md` lists: a token pipeline or DTCG file in the repository, a second theme or brand, or a ramp generated against target contrast. |
| `references/icons-and-imagery.md` | Phase 3 only when the build draws or extends an icon set, places a raster or a chart, or the inventory names imagery. |
| `references/accessibility.md` | Phase 3 only before a composite widget from `references/component-system.md`; Phase 5 its `## Sweep` section alone. |
| `references/performance-budget.md` | Phase 3 only when the build adds a hero raster, a font the repository does not load, or a persistent effect; Phase 5 its `## Outcome thresholds` and `## Hard failures` sections alone. |
| `references/internationalization.md` | Phase 1 when the product ships more than one language, the repository carries translation machinery, or the audience reads a right-to-left or non-Latin script. |

## Symptoms

A complaint names a fault in the words of the person who saw it, and those words are not the words the fault is written under. This table is the only step between the two: it says which file owns the symptom, and that file's own row above says when it may be read. A symptom with no row here is diagnosed in Phase 4, not guessed at.

| Reported as | Owned by |
|---|---|
| flat, cheap, unfinished, generic, or like a template | `references/visual-critique.md`, its `## Slop tropes` and `## Unsupported-pattern test` |
| empty, bare, or too much white space | `references/composition.md`, its `## Build density without clutter`, against every quiet region's named job in `references/visual-direction.md` |
| cluttered, noisy, or hard to scan | `references/composition.md` for grouping and pacing, `references/typography.md` its `## Scale` for the hierarchy |
| cramped, misaligned, or spaced inconsistently | `references/implementation.md`, and `references/component-system.md` its `## Scales, not values` |
| the type reads wrong, dated, or hard to read | `references/typography.md` |
| the colours look muddy, garish, or washed out | `references/visual-direction.md` its `## Palette`, and `references/tokens.md` past the role tokens |
| the page jumps, stalls, or feels slow to arrive | `references/performance-budget.md` for the cause, `references/feedback-and-status.md` for what is shown while it waits |
| the motion distracts, or nothing seems to respond | `references/motion.md` for the first, `references/interaction-qa.md` for the second |

## Phase 1 — Context

State three facts, defaulting absent ones: product in one sentence; audience and what they know on arrival; the page's single action or belief. Read durable design context through `scripts/context.mjs --surface <name> --needs color,typography,controls,motion`, reporting a `potentially-stale` or `unknown` status rather than resolving it silently. For a bounded redesign, record the baseline first — hierarchy, density rhythm, geometry, type contrast, surface depth, interaction emphasis — and name which the complaint is about. Keep a list of every repository path and line range this phase read; Build hands it to each builder as `FILES`.

For a full or bounded redesign, write the content inventory and collect at least three subject observations, mapping each as `observation → visual/content behavior → repeated echo` under the rules in `references/composition.md`. Ask one question only when a missing fact materially changes scope, behavior, or a claim; never substitute a product-category aesthetic for missing evidence.

## Phase 2 — Direction

Decide the direction, which settles composition and visual material together. Outside an existing brand or design system, commit to one bold aesthetic direction before Build: the contract names it and every region carries it; a neutral middle is not a direction. An open identity — none exists yet, or the brief lets it be replaced — runs contract → variant → selection: derive an axis space from Phase 1 evidence and write it as `$RUN/space.json` in the shape the script's header names, deal seeded axes with `scripts/direction.mjs --plan --seed <token> --space "$RUN/space.json" --variants 3 > "$RUN/contracts.json"`, where the seed is one token this session picks, fill each contract, writing the space, the contracts, and the labels as JSON directly and never through a generator or fill script because the script costs the minutes it was meant to save, and validate the set with `--check` to status ok before building any variant. Then make the offer `## Asking` defines and end the turn on it. On a yes, start the picker first, with `--comps "$RUN" --frame` at the frame the surface needs, `390x844` for a phone-first surface and `1280x800` otherwise, and the Bash tool's `run_in_background` so the tab opens while the comps are still being typed. Then write each `$RUN/variant-<n>/index.html` here, from its contract, inside the comp budget `references/direction-preview.md` sets and at that same frame: a delegate per comp costs its brief and its report for a file this session can type, and it is this session that holds the contract. The picker holds one empty seat per contract, fills each as its file lands, and prints the chosen index when the click arrives, or exits 3 and leaves the `--recommend` contract as the selection. The picker is the first render of the comps: no capture, screenshot, or repair pass runs before it opens. Freeze the selection with `--select > "$RUN/contract-selected.json"` for Build, the critique, and QA. Change no production code before a selection exists. A kept identity, a settled design system, a new piece with or without one, or a tweak produces one direction, no variants, no offer, and no selection gate. The direction is decided in this session, never inside a builder delegate.

## Phase 3 — Build

A surface whose direction was decided before this run — a plan's `Contract:`, a brief's `contract-selected.json`, or the piece path's direction artifact — builds here, in this session, from that contract and the Phase 1 file ranges, because a builder brief plus its report costs more than the edits it forwards. Every other build runs in `general-purpose` delegates on `sonnet` from `builder-prompt.md`, each given `$RUN/contract-selected.json`, its inventory slice, the reference rows whose predicate its scope meets, and as `FILES` the Phase 1 list of paths and line ranges, so a builder opens no whole file. An inventory of at most two surfaces is one call with scope `all`, which writes foundation.md and every `build-<surface>.md` in `$RUN`; more surfaces run foundation first — one call with scope `foundation` writes the tokens file, the base layer, and the primitives the inventory repeats, and returns foundation.md — then one call per surface, all in one message, each given that same foundation.md. Every report is at most 20 lines; code stays on disk and this session reads the reports, not the code. Run the repository's own checks once every builder has returned. The rest of this phase binds the builders. Build the recorded motion decision; a redesign or new piece without one is unfinished. Where the subject's world names a technique — a canvas, an instrument, generative motion — build the technique itself, not a static imitation. A component the design repeats is unbuilt while a reachable entry of its state row is unstyled, and a surface with no existing product is unfinished while a content obligation from the inventory is missing or a region still carries placeholder material. The floor, whose state, timing, and reachability mechanics live in `references/interaction-qa.md`:

- no horizontal scroll from 360px through 1440px;
- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;
- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;
- targets at least 24×24 CSS px — the WCAG 2.2 AA minimum, exempt only for sufficient spacing, an equivalent control, inline text, a user-agent default, or an essential presentation — with 44×44 as the enhanced target and the default under a coarse pointer;
- reduced-motion handling for every animation and semantic HTML beneath styling;
- reflow at 320×256 CSS px with no scrolling in two dimensions, unless the content requires a two-dimensional layout for usage or meaning;
- the largest element loading eagerly, every element above the fold reserving its space, and no persistent animation on a layout or paint property; anything costlier carries the cost disclosure `references/performance-budget.md` defines.

The underdesign floor, checked before the critique: the ground is a designed surface, not an untouched flat neutral; raised surfaces carry the direction's material, not one grey shadow each; type carries a voice through a second weight, width, or family; the recorded motion decision is built; every browser surface on the finish list in `references/implementation.md` is themed; and no slop trope from `references/visual-critique.md` stands without recorded provenance. `text-wrap: pretty`, CSS grid and subgrid, `color-mix()`, masks, and scroll-driven animation are the idiom, not enhancements to ration; the shapes live in `references/craft-recipes.md`.

## Phase 4 — Visual critique

A full or bounded redesign renders at three checkpoints, each at 390px and 1440px: baseline before the first edit, post-build before the critique fixes, and final after them, captured with `scripts/capture.mjs --full-page --out "$RUN/renders"`. Under an open identity the baseline pair follows the selection, because nothing renders before the offer is answered. The baseline pair is this session's; the post-build and final pairs belong to a `general-purpose` delegate on `opus` from `critic-prompt.md`, which receives `$RUN`, the surface URL, and the round, captures, runs `scripts/check-ui.mjs` and `scripts/inspect-render.mjs`, opens the renders in its own context, and writes faults.md in `$RUN` in round one and verdict.md there in round two. Those six are the render budget for Phases 4 and 5: read faults.md with `head -60`, repair every fault (through the surface builder for a surface, directly for a line), then send the final pair to the same reviewer, resumed; two rounds are the cap, and a fault still open after round two is reported, not chased. A build made in this session under a direction decided before the run takes round one only: the repairs are proven by this session's own `scripts/capture.mjs` pair and `scripts/check-ui.mjs` run, because a second reviewer context re-reads the whole surface to confirm edits this session watched land. No render between repairs, no probe page against the engine, no repair for an engine quirk the source does not show; when a capture contradicts a rule the source follows, report it and move on. No MCP browser tool inside this skill — no `browser_screenshot`, `browser_evaluate`, or snapshot against the surface: the render path is `scripts/capture.mjs` and the reviewer. After the reviewer's report this session spends at most 12 tool calls on Phases 4 and 5 together; past that, report what remains open.

The reviewer meets that file's fault contract — three faults for a redesign, one repaired rendered fault for a new piece, each naming its region, defect, and repairing edit. One fault may name the direction itself; the repair is then a return to Phase 2, not another polish pass. That return happens at most once per redesign; a second direction fault ends the turn with the renders and the faults reported.

## Phase 5 — QA

Read the `scripts/check-ui.mjs` findings for 390px and 1440px that the reviewer's faults.md in `$RUN` carries, repairing every `content-clipped` and `element-overlap` finding before the design is reported complete, then the interaction and accessibility sweep — including the recorded motion decision's route, the sweep in `references/accessibility.md`, and, where that file's predicate applies, the locale and RTL rerun in `references/internationalization.md` — then exercise one interactive control; the final render is the reviewer's second round, or this session's own capture where Phase 4 took round one alone. Report the outcome numbers from `references/performance-budget.md` beside the design, naming which were measured under throttling and which were not. A redesign is complete only when the baseline, post-build and final pairs exist under `$RUN/renders/`, source and rendered pixels changed between consecutive checkpoints, and the fixed faults include one content or relationship fault and one craft fault. With no render path, report visual verification as blocked, name what went unchecked, and do not report the design complete. Close under the closing rule in `using-exo`: what the surface now does, the checks that ran with their results, and the one open action.

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
