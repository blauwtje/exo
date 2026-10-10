# Phase detail

Per-phase detail the skill body omits: Phase 1 context, the build floor, render budget, critique dispatch, QA. The enemy is phase detail in the always-read body, paid for by every run, including the tweak that needs none. The overcorrection is a phase reduced to its name, which builds whatever the session felt like.

## Contents

- [Context](#context)
- [Full run](#full-run)
- [The build floor](#the-build-floor)
- [The critique dispatch](#the-critique-dispatch)
- [QA](#qa)
- [Precedence](#precedence)
- [Judgment](#judgment)

## Context

- Missing fact (including an `## Open` line `exo:survey-ui` returns) → ask one question only if it materially changes scope, behavior or a claim; never substitute a product-category aesthetic for missing evidence, which the chosen mood fills.
- State three facts, defaulting absent ones: product (generic when unnamed, no invented brand or domain); audience and arrival knowledge; page's one action or belief.
- Durable design context → `scripts/context.mjs --surface <name> --needs color,typography,controls,motion`.
- `potentially-stale` or `unknown` status → report it, not resolve silently.
- Request names no surface files → delegate locating markup, styles, tokens and components to the `exo:locate-code` agent; read here only the ranges under its `Read next:`.
- Keep a list of every repository path and line range this phase read; Build hands it to each builder as `FILES`.

## Full run

Full run starts only when the user asks for a survey, a critique or QA; it replaces the one pass's capture, look and fix steps.

- Phase 1 runs none of `## Context` here.
- Surface renders → this session first takes the baseline pair under `## The critique dispatch`.
- The `exo:survey-ui` agent, dispatched with `RUN`, `SKILL`, `REPO`, `SURFACE`, `SIZE` and `REQUEST`, collects the baseline record, content inventory and at least three subject observations into `$RUN/inventory.md` and `$RUN/files.md`.
- Build hands `$RUN/files.md` to each builder as `FILES`, under `## Full run builders` of the `phase-build` reference.
- Phase 3 rows of the skill's References table → read by the surface builder, not the main session, except the build row, which decides who builds.
- Phase 4 follows `## The critique dispatch` after the build and the post-build checkpoint.
- Phase 5 → a `general-purpose` delegate on `sonnet` runs `## QA`; this session reads only that section's last two bullets (close, ignore entry) and quotes qa.md.

## The build floor

The floor checked before the critique is `## The build floor` of the `build-pass` reference; read that section and the sections it names.

## The critique dispatch

- Full run renders at three checkpoints, nowhere between, each at 390px and 1440px: baseline before the first edit, post-build before the critique fixes, and final after them.
- Run each with `scripts/checkpoint.mjs --run "$RUN" --stage <checkpoint> --url <u> [--source <s>]`, where `<checkpoint>` is `baseline`, `post-build` or `final`.
- Each pair lands as `<checkpoint>-390x844-fullpage.png` and `<checkpoint>-1440x900-fullpage.png` under `$RUN/renders`.
- Rung 3 of the skill's `## Route` → baseline stage follows the selection; nothing renders before the offer is answered.
- Surface that did not render before the run → no baseline stage.
- Render budget for Phases 4 and 5: six captures, or four without a baseline pair.
- Post-build checkpoint call writes `$RUN/critic-evidence.json`: check-ui and inspect-render findings, render delta, style inspection for that stage.
- Dispatch the `exo:critique-ui` agent once with `RUN` and `SKILL` and no other input.
- Critic renders nothing; reads the evidence, writes faults.md in `$RUN`.
- Critic meets the fault contract in the `visual-critique` reference: three or four faults for a redesign, one repaired rendered fault for a new piece.
- Each fault names its region, defect, evidence, target, and repairing edit.
- One fault may name the direction itself; its repair is a new direction, not another polish pass, so the cycle ends there.
- Fault names the direction → repair the other faults, take the final pair, report the direction fault with the renders as the one open action.
- Read faults.md with `head -60`.
- Critic returned without faults.md → resume that same critic once to write it from what it read; no fresh dispatch.
- Every surface with faults → one `exo:build-ui` dispatch with `SCOPE=repair:<surface>`, all in one message.
- The repair scope renders nothing and writes `$RUN/repair-<surface>.md`, at most 10 lines: one line per fault, `<fault title>: fixed|open <reason>`, then the paths written.
- After every repair returns → prove repairs with this session's own `scripts/checkpoint.mjs --stage final` call.
- One critic round is the cap.
- No render between repairs.
- No probe page against the engine.
- No repair for an engine quirk the source does not show; capture contradicts a rule the source follows → report, move on.
- No MCP browser tool inside this skill (no `browser_screenshot`, `browser_evaluate` or snapshot against the surface): the render path is `scripts/capture.mjs` and the critic.
- Each repair dispatch is capped by the build-ui agent's maxTurns; this session keeps no separate tool-call cap on its own repair work.

## QA

- Checks line quotes check-ui's own `comparison.counts` at 390px and 1440px: `before`, `after`, `new`, `ignored`.
- Quote `predating` as a count only, never a list.
- Never quote a count this session filtered itself.
- No stage called this skill → checks line also names each type-check, lint and test command run before check-ui, with its result.
- Report lists each default the build fell back on that check-ui did not flag (stock font, template ground, row of identical cards) as a candidate rule for exo.
- A `general-purpose` delegate on `sonnet`, dispatched with `RUN`, `SKILL` and `REPO`, reads and runs this section.
- It writes `$RUN/qa.md`, at most 20 lines, and returns only the qa.md path and line 1.
- Line 1 of qa.md is `qa=complete|incomplete|blocked`; line 2 is the checks line.
- Line 3 is `dials density=<n> variance=<n> motion=<n>`, the contract's final numbers; the closing message repeats it.
- Then one line per open item, the performance numbers each tagged `measured`, `unthrottled` or `not measured`, and the candidate-rule lines.
- Read line 1 of the final stage's `scripts/checkpoint.mjs --stage final` call: `stage=final renders=<n> blocking390=<n> blocking1440=<n> blockingStatic=<n> new=<n> predating=<n> ignored=<n>`.
- Before reporting complete → repair every blocking finding, repair or name every new `potential` finding, per the `phase-build` reference `## Judgment`.
- Read `$RUN/check-ui-final.json` only for the detail of a finding this pass repairs.
- Then the interaction and accessibility sweep: every motion in the bar, the sweep in the `accessibility` reference, and the locale and RTL rerun in the `internationalization` reference where that file's predicate applies.
- Exercise one interactive control.
- Final render → a capture this pass takes itself.
- Report the `performance-budget` reference's outcome numbers beside the design, naming which were measured under throttling and which not.
- Full run complete only when the post-build and final pairs exist under `$RUN/renders/`, with the baseline pair before them for a surface that rendered before the run.
- Completion also needs source and rendered pixels changed between consecutive checkpoints.
- Completion also needs the fixed faults to include one content or relationship fault and one craft fault.
- No render path → report visual verification blocked, name what went unchecked, do not report the design complete.
- Close under the closing rule in `route-skills`: what the surface now does, the checks that ran with their results, and the one open action.
- User confirms a finding as false positive → entry with `type`, `file` and `reason` in `docs/design/check-ui-ignore.json`, written only after that confirmation.

## Precedence

- Approved durable design decision outranks a new direction; changing one requires asking first.
- Repository framework, naming, file-layout and component conventions outrank this skill's code defaults; they do not preserve the visual anatomy the user asked to replace.
- Scope restraint limits which surfaces and files change; it never requires the smallest visual delta inside them.
- The motion bar binds every build; a brief asking for showier motion raises it, while contrast, reduced motion and state coverage still hold.

## Judgment

- The floor outranks the direction: a surface that misses contrast, reflow, reduced motion or target size is not finished, whatever it looks like.
- A measured number outranks an estimate, and a check that was not measured is reported as not measured.
- One critique cycle outranks a second: a fault against the direction itself ends the cycle and is reported, never polished around.
- A fault the final pair still shows is reported, not chased, and the source outranks an engine quirk a capture shows.
- Technical correctness never compensates for an underdesigned result.
