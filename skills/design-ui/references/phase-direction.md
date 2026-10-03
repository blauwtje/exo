# Phase 2: Direction

Settle one direction from Phase 1 evidence. The enemy is a neutral middle that no region carries. The overcorrection is a picker offered to a user who did not ask to choose.

## Every rung

- Decide the direction in this session, never inside a builder delegate, because this session holds the contract.
- Change no production code before a selection exists.
- Outside an existing brand or design system, derive one bold direction from the chosen mood before Build.
- The direction settles composition and visual material together: the contract names it and every region carries it.
- Every rung other than 3 produces one direction, written as the skill's plan, with no variants, no offer, and no selection gate.
- Freeze the selection and start Build in the turn the direction's click or exit 3 arrives.

## Mood to look

- The mood sets palette commitment, type character, corner and stroke shape, density and motion feel, never the amount of motion.
- Crisp and businesslike: a restrained accent, compact rhythm, sharp corners, tabular figures and snappy precise easing on every motion of the motion bar.
- Friendly and playful: committed color, rounded shapes, a warm humanist face and lively overshoot on entrances.
- Calm and luxurious: a tonal ground, generous space, refined type contrast and slow eased motion.
- Bold and expressive: saturated regions, heavy display type, hard edges or offsets and large travel.
- Where `--plan` dealt a `palette.hue` or `--deal` a `hue`, build the accent on it, taking only its chroma and lightness from the mood.
- Record the mood in the contract's rationale, or in the plan on the one pass, and trace each look value to it.
- Invent no company, brand story or metaphor as a theme, because the mood and the content carry the look.

## The one pass

Run these in order before the first edit.

- Create `$RUN` first, as the `intake` reference names it.
- Run `node <skill dir>/scripts/direction.mjs --deal --kind <kind> --history /private/tmp/designing > "$RUN/deal.json"` without `--seed`.
- The kind is `app` for an admin, dashboard or tool, `page` for a landing, marketing or editorial page.
- Run the `typography` reference's candidate gate into `$RUN/font-candidates.json` with `--history /private/tmp/designing` and no `--seed`, and take both faces from its eligible set.
- Write the plan on the dealt `hue`, as `## Mood to look` says.
- Draw the plan's ASCII layout on the dealt `layout.nav`, `layout.body` and `layout.lead`.
- Depart from a dealt slot only for a content relationship it cannot hold, named in `layout.override.reason`, never for taste.
- Write `$RUN/plan.json` beside the transcript plan as `{"seed","kind","hue","layout":{"nav","body","lead"},"palette":{"anchors":[{"role","hex"}]},"type":{"display":{"family"},"body":{"family"}}}`.
- Copy its `seed`, `kind`, `hue` and `layout` slots from `deal.json`.
- Run `node <skill dir>/scripts/direction.mjs --check-plan --deal "$RUN/deal.json" --plan "$RUN/plan.json"`, and revise both plans until it reports `"status":"ok"`.

## Rung 3

Rung 3 runs contract, variant, selection.

- Write the space, the contracts, and the labels as JSON directly never through a generator or fill script.
- Derive an axis space from Phase 1 evidence and write it as `$RUN/space.json` in the shape `scripts/direction.mjs --shape` prints.
- Deal three contracts over the space's axes with `scripts/direction.mjs --plan --space "$RUN/space.json" --variants 3 > "$RUN/contracts.json"`, without `--seed`, so the script draws a random one.
- Fill only the contract this session recommends and write it as a one-contract container to `$RUN/recommended.json`.
- `--check` the recommended contract to status ok, then write the tab's copy as `$RUN/sketch-labels.json`.
- Ask nothing between `--check` and the first sketch, because the scope form already carried the offer.
- Make the offer `## Asking` of the `intake` reference defines.
- Select autonomously only where the user delegated the choice, took the second option, the sketch tab or the picker exited 3, or a read-only planning mode allows no picker; record the rationale in the contract.
- On the second option, freeze `$RUN/recommended.json` with `--select --index 0 --space "$RUN/space.json" > "$RUN/contract-selected.json"`.
- Every `--check` and `--select` call passes that `--space` file, plus `--candidates "$RUN/font-candidates.json"` once that file exists.

## The sketch answer

- On the preview option, send one message holding the `sketch-tab` reference's `--serve` start, a Write of `$RUN/sketches/001-direction.html`, and its `--wait` start with `--sketch 001-direction.html`, both script calls under the Bash tool's `run_in_background`.
- The sketch shows every dealt direction from its axes, under the `sketch-tab` reference, and each option's `data-choice` is the contract's dealt index.
- The other contracts stay unfilled, because a sketch needs only a direction's visible material.
- A `steer` in the answer is a revision: write the next sketch file and wait again.
- A click on the recommended direction freezes `$RUN/recommended.json` as the second option does.
- A click on another direction fills that one contract, writes it as a one-contract container to `$RUN/chosen.json`, and `--check`s it to status ok.
- Freeze that contract with `--select --index 0 --space "$RUN/space.json"`.

## Full comps

Full comps are built only when the user asks to see directions whole.

- Send one message holding a Write for every `$RUN/variant-<n>/index.html`, because each message costs a round trip.
- Build each variant from its contract here, inside the comp budget the `direction-preview` reference sets, never through a delegate per comp.
- Run `pick.mjs --check`, read every capture and `check-ui.json`, and repair before the picker opens, as `## Before the picker` of `direction-preview` says.
- Fill the contracts of the directions still standing and write them as one container to `$RUN/finalists.json`.
- Next, validate the set with `--check` to status ok before building any variant, then write `$RUN/labels.json`.
- Start `pick.mjs` with `--comps "$RUN" --contracts "$RUN/finalists.json"`, adding `--frame 390x844` only for a phone-first surface.
- The picker prints the chosen index when the click arrives.
- Freeze the selection with `--select --contracts "$RUN/finalists.json" --index <n> --space "$RUN/space.json" > "$RUN/contract-selected.json"`.

## A planning turn

- A planning turn routes by `## Route` and makes the offer on rung 3 only.
- On option A, it runs the sketch tab under `$RUN` and freezes the clicked contract as `## The sketch answer` says.
- On option B, it freezes the contract the user's letter named the same way.
- On option C, or on any other rung, it writes the space file, deals `--plan --space <file> --variants 2` without `--seed`, keeps and fills one contract, `--check`s it, and freezes it with `--select --index 0 --space <file>`.
- Add `--candidates <file>` to that freeze when fonts came from the candidate gate.
- The plan records the selection under `## Visual direction` as `Contract: docs/design/direction.json`.
- The plan carries that output verbatim in the Edit block of its first Build step, which writes that file.
- A read-only planning mode runs no `scripts/direction.mjs` call, because that mode cannot write `$RUN`.
- In that mode the plan records `Direction: pending at rung <n>` under `## Visual direction` with the evidence that placed it there.
- The build session then runs Phase 2 from that rung before Build.

## Judgment

- A settled identity outranks a new direction unless the user or the brief lets it be replaced.
- The user's own request for options is the only trigger for the offer; a landing page, an open identity or a full redesign is not.
- A click in the sketch tab or the picker outranks this session's preference; an exit 3 makes the `--recommend` contract the selection without a further question.
