---
name: designing
description: "Use when a page, component, or visual axis changes (type, color, spacing, motion, copy), including a redesign or a surface called empty, boring, or generic. When a new visual surface does not name its displayed data, settings, or behavior, shaping decides those first; designing follows for presentation. Not for typo-only fixes or behavior with no visual effect."
argument-hint: <page, component or visual change>
effort: high
---

# Visual Design

Design so the result cannot be mistaken for a template: every visual choice traceable to the subject, audience, or page job, plus one evidence-backed differentiator a competitor could not justify. The enemy is the transferable default — a design that could accept another product name unchanged. The overcorrection is novelty that obscures content, removes states, or breaks accessibility.

A full or bounded redesign fails when the rendered result stays materially interchangeable with the baseline, when supporting regions stay generic while one focal point carries the design, or when a large empty area has no content, grouping, pacing, or staging job. Do not default an open axis — composition, type, chromatic hierarchy, surface treatment, imagery, motion — to absence: restraint on one axis needs a brief-side reason and expression on the others.

**After a compaction notice**, resume from the newest `/private/tmp/designing/*/` run directory, not the conversation: Build reopens from its `contract-selected.json`, and `renders/` shows the checkpoints reached.

## Size the request

This skill owns a visual change at any file count, because Build dispatches its own builders. A surface whose displayed data, settings or behavior is undecided goes to `shaping` first; a change that also adds state, persistence, a dependency or a network call belongs to `implementing-batch`, which borrows this skill for the look.

- **Sketch:** a demo, prototype, or mock the request names as one, built on `## The sketch path` of `references/phase-build.md`: no variants, agents, or critic; the floor holds.
- **Full or bounded redesign:** a new page/view/identity; a request changing at least three of composition, palette, type, motion, and content hierarchy; or a report that an existing surface is empty, boring, generic, flat, unfinished, or not distinctive. Run all five phases, bounded to the named surface; the existing direction is evidence, not a veto.
- **New piece:** a section, component, or view inheriting the existing direction, on `## The piece path` of `references/phase-build.md`. A piece that changes the page's hierarchy is a bounded redesign.
- **Tweak:** one element or named visual property changes and no region is added. Change it, audit the touched surface, verify the floor, and stop; never expand a tweak into a redesign.

## Route

Resolve the surface from the markup and style files in the working-tree diff, then the last touched one; with neither, ask only which surface, naming the candidates newest first. Then stop at the first matching rung, because comps earn their cost only where a chooser recognises a direction they cannot name:

1. **Tweak:** the tweak path.
2. **Handed a direction:** a plan's `Contract:` or a brief's `contract-selected.json` is copied to `$RUN/contract-selected.json` and resumes at Build (Phase 3), repeating neither Phase 1-2 nor the variant choice.
3. **Asked to choose:** the user asks to see or choose between directions, or the brief's `## Visual direction` names the user as chooser: the offer in `## Asking` of `references/intake.md`.
4. **Sketch:** the sketch path.
5. **Settled identity:** the evidence `## Settled identity` of `references/intake.md` lists, read when rungs 1-4 miss, while neither the user nor the brief lets it be replaced: one direction in text, no offer. A component library in the manifest is not that evidence on its own, because its defaults are the template this skill exists to replace.
6. **Tool surface:** an open identity on an app view, dashboard, admin or settings page, form, documentation page, internal tool, or component: one direction in text from Phase 1 evidence and the nearest sibling surface, no offer, because scanability and existing expectations outrank expression there.
7. **Expression surface:** an open identity on a landing, marketing, pricing, portfolio, or launch page, whose job is a first impression on someone who has not adopted the product: the offer, as in rung 3.

A surface neither list names takes rung 6, and the report names rung 7 as the rival reading, because the user can still ask for directions while a picker's spent minutes stay spent. A vague complaint sizes the request and the evidence picks the rung. A user who leaves the look to this skill has not asked for text: rung 7 still offers.

## The loop

The references call these steps Phase 1 to 5.

1. **Context.** Read `## Context` of `references/phase-detail.md`. A full or bounded redesign takes the baseline pair first and hands Phase 1 to the `exo:design-discovery` agent; this session reads its report of at most 20 lines and asks its `## Open` questions, never the repository ranges.
2. **Direction.** Decide it in this session, before any production code changes, under `references/phase-direction.md`.
3. **Build.** Read `references/phase-build.md` and `## The build floor` of `references/phase-detail.md` before the first edit or builder dispatch.
4. **Critique the render.** A full or bounded redesign reads `## The critique dispatch` of `references/phase-detail.md` before the baseline capture, which precedes the first edit.
5. **Check.** Run `## QA` of `references/phase-detail.md`; once an `exo: context` line has appeared in this session, a `general-purpose` delegate on `sonnet` runs it with `RUN`, `SKILL`, `REPO` and that section, returning at most 20 lines.

## References

Load a reference only at its row's phase and predicate, never the set up front. Phase 5 rows load by section: `grep -n '^## '`, then `sed -n` to the next heading. Phase 3 rows are read by the surface builder, never by this session, except `references/phase-build.md`, which decides who builds.

| File | Read it when |
|---|---|
| `references/intake.md` | Before Phase 1: asking, the run directory, symptoms; its `## Settled identity` when Route rungs 1-4 miss. |
| `references/phase-detail.md` | At each loop step, only the section that step names. |
| `builder-prompt.md` | Phase 3, before every build dispatch. |
| `references/phase-direction.md` | Phase 2, before deciding the direction. |
| `references/phase-build.md` | Phase 3, before the first edit or builder dispatch. |
| `references/visual-direction.md` | Phase 2, every direction decision; Phase 1 when the repository or docs/design/DESIGN.md holds a design system to extract. |
| `references/sketch-tab.md` | Phase 2 on rungs 3 and 7, after `--check` reports ok and before the offer; elsewhere, before the first visual choice the user asked to see. |
| `references/direction-preview.md` | Phase 2, only when the user asks to see directions whole, before building the picker's comps. |
| `references/composition.md` | Phase 1 content inventory; Phase 2 structure; Phase 3 layout. |
| `references/typography.md` | Phases 2–3, only when choosing or changing type. |
| `references/controls.md` | Phase 3, before styling a button, field, menu, toggle, tab, or filter. |
| `references/implementation.md` | Phase 3, before writing CSS or component code. |
| `references/motion.md` | Phase 3 for the recorded motion decision, and before any animation at every size. |
| `references/interaction-qa.md` | Phase 3 when the surface has controls, flows, disclosure, or reachable states; Phase 5 `## Pre-ship interaction sweep` alone. |
| `references/feedback-and-status.md` | Phase 3 only when the surface waits on the network, applies a change before its response, or reports status outside the changed region; Phase 5 `## Sweep` alone. |
| `references/visual-critique.md` | Phase 4, by `exo:design-critic` only; this session reads its faults.md. |
| `references/craft-recipes.md` | Phase 3 once `contract-selected.json` exists, before the first CSS of a ground, surface, motion, or type treatment. |
| `references/component-system.md` | Phase 1 `## Adopt before authoring` alone, when the repository ships a component layer; Phase 3 before building a control, field, or surface the design repeats. |
| `references/tokens.md` | Phase 2 only for a token pipeline or DTCG file, a second theme or brand, or a ramp generated against target contrast. |
| `references/icons-and-imagery.md` | Phase 3 only when the build draws or extends an icon set, places a raster or chart, or the inventory names imagery. |
| `references/accessibility.md` | Phase 3 only before a composite widget; Phase 5 `## Sweep` alone. |
| `references/performance-budget.md` | Phase 3 only when the build adds a hero raster, an unloaded font, or a persistent effect; Phase 5 `## Outcome thresholds` and `## Hard failures` alone. |
| `references/internationalization.md` | Phase 1 when the product ships more than one language, the repository carries translation machinery, or the audience reads a right-to-left or non-Latin script. |

## Judgment

- Explicit brief requirements outrank every design default and tell list, and a human selection of a rendered variant outranks this skill's own preference.
- An approved durable design decision outranks a new direction; changing one requires asking first.
- Repository framework, naming, file-layout, and component conventions outrank this skill's code defaults; they do not preserve the visual anatomy the user asked to replace.
- Scope restraint limits which surfaces and files change; it never requires the smallest visual delta inside them.
- Accessibility and complete content/state coverage outrank visual novelty.
- A brief asking for showy motion or effects raises the ambition ceiling: tells and timing caps become defaults to exceed deliberately; contrast, reduced-motion, and state coverage still hold.
- This skill owns visual decisions only. When a `shaping`, `planning`, `implementing-batch`, or `debug` stage called it, return control for product decisions, ordering, wiring, persistence, validation, proof, and reporting. When no stage called it, execute the visual-only request and report directly.
