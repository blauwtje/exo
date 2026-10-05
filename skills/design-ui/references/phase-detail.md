# Phase detail

The per-phase detail the skill body no longer carries: what Phase 1 establishes, the floor a build may not go under, the render budget and the four calls made before the critic judges, and what the QA sweep covers. The enemy is a phase whose detail sits in the always-read body and is paid for by every run, including the tweak that needs none of it. The overcorrection is a phase reduced to its name, which builds whatever the session felt like building.

## Contents

- [Context](#context)
- [Full run](#full-run)
- [The build floor](#the-build-floor)
- [The critique dispatch](#the-critique-dispatch)
- [QA](#qa)
- [Precedence](#precedence)
- [Judgment](#judgment)

## Context

- When a fact is missing, including an `## Open` line the `exo:survey-ui` agent returns, ask one question only if it materially changes scope, behavior, or a claim; never substitute a product-category aesthetic for missing evidence, which the chosen mood fills.
- State three facts, defaulting absent ones: product, kept generic when unnamed, not invented brand or domain; audience and arrival knowledge; page's one action or belief.
- Read durable design context through `scripts/context.mjs --surface <name> --needs color,typography,controls,motion`.
- Report a `potentially-stale` or `unknown` status rather than resolving it silently.
- When the request does not name the surface's files, delegate locating its markup, styles, tokens and components to the `exo:locate-code` agent.
- Read here only the ranges under the agent's `Read next:`.
- Keep a list of every repository path and line range this phase read; Build hands it to each builder as `FILES`.

## Full run

The full run starts only when the user asks for a survey, parallel builders, a critique or QA; it replaces the one pass's capture, look and fix steps.

- Phase 1 runs none of `## Context` here.
- This session first takes the baseline pair under `## The critique dispatch` when the surface renders.
- The `exo:survey-ui` agent, dispatched with `RUN`, `SKILL`, `REPO`, `SURFACE`, `SIZE` and `REQUEST`, collects the baseline record, the content inventory and at least three subject observations into `$RUN/inventory.md` and `$RUN/files.md`.
- Build hands `$RUN/files.md` to each builder as `FILES`, under `## Full run builders` of the `phase-build` reference.
- Phase 3 rows of the skill's References table are read by the surface builder, never the main session, except the build row, which decides who builds.
- Phase 4 follows `## The critique dispatch` after the build and the post-build checkpoint.
- Phase 5 is a `general-purpose` delegate on `sonnet` running `## QA`; this session reads only that section's last two bullets, the close and the ignore entry, and quotes qa.md.

## The build floor

The underdesign floor, checked before the critique:

- the ground is a designed surface, not an untouched flat neutral;
- the page background and any sidebar or side rail span the full page height at 390px and 1440px, full-page captures included, because one ending at the viewport or content height leaves a band of another color below;
- raised surfaces carry the direction's material, not one grey shadow each;
- type carries a voice through a second weight, width, or family;
- the motion bar is built;
- every browser surface on the finish list in the `implementation` reference is themed;
- no slop trope from the `build-pass` reference stands without recorded provenance;
- `text-wrap: pretty`, CSS grid and subgrid, `color-mix()`, masks, and scroll-driven animation are the idiom, not enhancements to ration, and their shapes live in the `craft-recipes` reference.

The numeric floor:

- no horizontal scroll from 360px through 1440px;
- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;
- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;
- targets at least 24×24 CSS px, the WCAG 2.2 AA minimum;
- a target is exempt only for sufficient spacing, an equivalent control, inline text, a user-agent default, or an essential presentation;
- 44×44 is the enhanced target and the default under a coarse pointer;
- reduced-motion handling for every animation and semantic HTML beneath styling;
- reflow at 320×256 CSS px with no scrolling in two dimensions, unless the content requires a two-dimensional layout for usage or meaning;
- the largest element loading eagerly, every element above the fold reserving its space, and no persistent animation on a layout or paint property; anything costlier carries the cost disclosure the `performance-budget` reference defines.

## The critique dispatch

- A full run renders at three checkpoints and nowhere between them, each at 390px and 1440px: baseline before the first edit, post-build before the critique fixes, and final after them.
- Run each with `scripts/checkpoint.mjs --run "$RUN" --stage <checkpoint> --url <u> [--source <s>]`, where `<checkpoint>` is `baseline`, `post-build` or `final`.
- Each pair lands as `<checkpoint>-390x844-fullpage.png` and `<checkpoint>-1440x900-fullpage.png` under `$RUN/renders`.
- On rung 3 of the skill's `## Route` the baseline stage follows the selection, because nothing renders before the offer is answered.
- A surface that did not render before the run takes no baseline stage.
- The six captures, or four without a baseline pair, are the render budget for Phases 4 and 5.
- The post-build checkpoint call writes `$RUN/critic-evidence.json`: check-ui and inspect-render findings, the render delta and the style inspection for that stage.
- Dispatch the `exo:critique-ui` agent once with `RUN` and `SKILL` and no other input.
- The critic renders nothing; it reads the evidence and writes faults.md in `$RUN`.
- The critic meets the fault contract in the `visual-critique` reference: three or four faults for a redesign, one repaired rendered fault for a new piece.
- Each fault names its region, defect, evidence, target, and repairing edit.
- One fault may name the direction itself; its repair is a new direction, not another polish pass, so the cycle ends there.
- When a fault names the direction, repair the other faults, take the final pair, and report the direction fault with the renders as the one open action.
- Read faults.md with `head -60`.
- When the critic returned without writing faults.md, resume that same critic once to write the file from what it already read, never a fresh dispatch.
- Send every surface with faults one `exo:build-ui` dispatch with `SCOPE=repair:<surface>`, all in one message.
- The repair scope renders nothing and writes `$RUN/repair-<surface>.md`, at most 10 lines: one line per fault, `<fault title>: fixed|open <reason>`, then the paths written.
- After every repair returns, prove the repairs with this session's own `scripts/checkpoint.mjs --stage final` call.
- One critic round is the cap.
- No render between repairs.
- No probe page against the engine.
- No repair for an engine quirk the source does not show; when a capture contradicts a rule the source follows, report it and move on.
- No MCP browser tool inside this skill — no `browser_screenshot`, `browser_evaluate`, or snapshot against the surface: the render path is `scripts/capture.mjs` and the critic.
- Each repair dispatch carries its own cap through the build-ui agent's maxTurns; this session keeps no separate tool-call cap on its own repair work.

## QA

- The checks line quotes check-ui's own `comparison.counts` at 390px and 1440px: `before`, `after`, `new` and `ignored`.
- Quote `predating` as a count only, never a list.
- Never quote a count this session filtered itself.
- When no stage called this skill, the checks line also names each type-check, lint and test command run before check-ui, with its result.
- The report lists each default the build fell back on that check-ui did not flag, such as a stock font, a template ground or a row of identical cards, as a candidate rule for exo.
- A `general-purpose` delegate on `sonnet`, dispatched with `RUN`, `SKILL` and `REPO`, reads this section and runs it.
- It writes `$RUN/qa.md`, at most 20 lines, and returns only the qa.md path and line 1.
- Line 1 of qa.md is `qa=complete|incomplete|blocked`; line 2 is the checks line.
- Then come one line per open item, the performance numbers each tagged `measured`, `unthrottled` or `not measured`, and the candidate-rule lines.
- Read line 1 of the final stage's `scripts/checkpoint.mjs --stage final` call: `stage=final renders=<n> blocking390=<n> blocking1440=<n> blockingStatic=<n> new=<n> predating=<n> ignored=<n>`.
- Repair every blocking finding, and repair or name every new `potential` finding, as the `phase-build` reference `## Judgment` sets, before the design is reported complete.
- Read `$RUN/check-ui-final.json` only for the detail of a finding this pass repairs.
- Then run the interaction and accessibility sweep: every motion in the bar, the sweep in the `accessibility` reference, and, where that file's predicate applies, the locale and RTL rerun in the `internationalization` reference.
- Exercise one interactive control.
- The final render is a capture this pass takes itself.
- Report the outcome numbers from the `performance-budget` reference beside the design, naming which were measured under throttling and which were not.
- A full run is complete only when the post-build and final pairs exist under `$RUN/renders/`, with the baseline pair before them for a surface that rendered before the run.
- Completion also needs source and rendered pixels changed between consecutive checkpoints.
- Completion also needs the fixed faults to include one content or relationship fault and one craft fault.
- With no render path, report visual verification as blocked, name what went unchecked, and do not report the design complete.
- Close under the closing rule in `route-skills`: what the surface now does, the checks that ran with their results, and the one open action.
- A finding the user confirms as a false positive gets an entry with `type`, `file` and `reason` in `docs/design/check-ui-ignore.json`, written only after that confirmation.

## Precedence

- An approved durable design decision outranks a new direction; changing one requires asking first.
- Repository framework, naming, file-layout, and component conventions outrank this skill's code defaults; they do not preserve the visual anatomy the user asked to replace.
- Scope restraint limits which surfaces and files change; it never requires the smallest visual delta inside them.
- The motion bar binds every build; a brief asking for showier motion raises it, while contrast, reduced motion and state coverage still hold.

## Judgment

- The floor outranks the direction: a surface that misses contrast, reflow, reduced motion or target size is not finished, whatever it looks like.
- A measured number outranks an estimate, and a check that was not measured is reported as not measured.
- One critique cycle outranks a second: a fault against the direction itself ends the cycle and is reported, never polished around.
- A fault the final pair still shows is reported, not chased, and the source outranks an engine quirk a capture shows.
- Technical correctness never compensates for an underdesigned result.
