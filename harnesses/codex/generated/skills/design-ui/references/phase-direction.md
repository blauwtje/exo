# Phase 2: Direction

Settle one direction before any production code changes, from Phase 1 evidence. The enemy is a neutral middle that no region carries. The overcorrection is a picker offered to a user who did not ask to choose.

## Every rung

- Decide the direction in this session, never inside a builder delegate, because this session holds the contract.
- Change no production code before a selection exists; the direction comps and their entry are not production code until the click promotes one.
- Outside an existing brand or design system, derive one bold direction from the chosen mood before Build, because a neutral middle is not a direction.
- The direction settles composition and visual material together: the contract names it and every region carries it.
- The plan names the user's three most important tasks, most frequent first, because a screen ordered by its data serves no task.
- Order the layout by those tasks: the first takes the most prominent region and the nearest controls, the third the least space.
- Tag each major layout choice on its plan line with the Laws of UX rule deciding it: Hick, Fitts, Jakob, Von Restorff or another.
- Before the plan, shortlist three faces and three accent hues, then drop the first of each, since the first to mind is the house default.
- Give the display font, the body font and the accent hue one plan clause each naming this user and this product, as in "for <user> <task> in <product>", because a reason that fits any page is no reason.
- Derive faces and hues from the subject, the user and a named or saved product, never from a seed.
- Draw each plan ASCII layout in at most 8 lines per width, because the plan holds at most 25 lines.
- Every rung other than 3 produces one direction, written as the skill's plan, with no variants, no offer, and no selection gate.
- Freeze the selection and start Build in the turn the direction's click or exit 3 arrives, because the checked contracts are already on disk and builders return reports of at most 20 lines.

## Mood to look

- Take a named or saved product's finish, density and motion, never its brand, logo or exact layout, because a look-alike borrows that brand.
- Dare in one place: name one standout element the viewer remembers, such as a drenched KPI band, because an all-equal page reads generic.
- Color with confidence: tint the ground and surfaces from the palette and build depth from surface steps, not white boxes carrying one accent.
- Vary block shape by content job: a band, an open table, an inset panel and a card differ, not one card anatomy repeated.
- These three hold in every mood, crisp, businesslike, strict and clean included, because a quiet mood sharpens character and never removes it.
- The mood sets palette commitment, type character, corner and stroke shape, density and motion feel, never the amount of motion.
- Crisp and businesslike: tinted slate or ink surfaces, one committed accent region, compact rhythm, sharp corners, tabular figures and snappy precise easing on every motion of the motion bar.
- Friendly and playful: committed color, rounded shapes, a warm humanist face and lively overshoot on entrances.
- Friendly and playful with an image generator: plan generated illustrations of the page's own content in the direction's palette, because drawn character carries that mood.
- Prompt the generator with this product's content and direction, never an existing product's characters, mascot or look, because a look-alike borrows that brand.
- With no image generator, the Imagery trope of the `build-pass` reference holds: a labelled placeholder, never a drawn stand-in.
- Calm and luxurious: a tonal ground, generous space, refined type contrast and slow eased motion.
- Bold and expressive: saturated regions, heavy display type, hard edges and large travel.
- Pick hues, faces and radii yourself from the mood and the product, not from a seed or a stock default.
- Record the mood in the contract's rationale, or in the plan on the one pass, and trace each look value to it.
- Invent no company, brand story, metaphor or subject prop as a theme unless the user asks, because the mood and content carry the look.

## Rung 3

Rung 3 of the skill's `## Route`, reached only when the user asks to see or choose between looks, a Directions answer of 2 or 3 included, runs contract, variant, selection.

- Write the space, the contracts, and the labels as JSON directly and never through a generator or fill script, because the script costs the minutes it was meant to save.
- Derive an axis space from Phase 1 evidence and write it as `$RUN/space.json` in the shape `scripts/direction.mjs --shape` prints.
- Deal the contracts over the space's axes with `scripts/direction.mjs --plan --seed <token> --space "$RUN/space.json" --variants <n> > "$RUN/contracts.json"`.
- Give `--seed` one token this session picks.
- `<n>` is the Directions answer of the `intake` reference's form, else 3.
- Fill only the contract this session recommends and write it as a one-contract container to `$RUN/recommended.json`, because the other options need no second filled contract.
- `--check` the recommended contract to status ok.
- Ask nothing between `--check` and the first comp, because the scope form already carried the offer or the Directions question.
- Make the offer the `intake` reference's `## Asking` defines, except after a Directions answer of 2 or 3, which takes the preview option at once.
- Select autonomously only where the user delegated the choice, took the second option, the picker exited 3, or a read-only planning mode allows no picker; record the rationale in the contract.
- On the second option, freeze `$RUN/recommended.json` with `--select --index 0 --space "$RUN/space.json" > "$RUN/contract-selected.json"`.
- Every `--check` and `--select` call passes that `--space` file.

## The comps

The preview option, a Directions answer of 2 or 3, and a request to see directions whole all run the picker under the `direction-preview` reference; the sketch tab never shows a direction.

- Fill every dealt contract and write them as one container to `$RUN/finalists.json`.
- Next, validate the set with `--check` to status ok before building any variant, then write `$RUN/labels.json`.
- For a stack comp, write the direction entry and start the dev server before any builder, as `## Stack comps` of `direction-preview` says, so every builder renders through one URL.
- Dispatch one `exo-build-ui` per contract with `SCOPE: comp:<n>`, all in one message, because comps built in this session fill its context before Build starts.
- Hand each builder `RUN`, `REPO`, `SKILL`, the `FILES` ranges holding the surface's content, and as `CHECK` its folder and its `pick.mjs --check --variant <n>` command.
- Read only each builder's two-line return and its `$RUN/comp-<n>.md`, never a comp's source or capture, because the builder checked and viewed them.
- A report with an open fault sends that comp back to its builder once before the picker opens, because the chooser is never the first to see a broken comp.
- Start `pick.mjs` with `--comps "$RUN" --contracts "$RUN/finalists.json"` plus the builders' `--url` and `--source`, adding `--frame 390x844` only for a phone-first surface, since each comp otherwise fills the window width.
- The picker prints the chosen index when the click arrives, or exits 3 and leaves the `--recommend` contract as the selection.
- A `steer` in the answer is a revision: change the comps it names, check them again, and start the picker once more.
- Freeze the selection with `--select --contracts "$RUN/finalists.json" --index <n> --space "$RUN/space.json" > "$RUN/contract-selected.json"` for Build, the critique, and QA.
- Then promote the chosen comp as `## After the click` of `direction-preview` says, because Build starts from the screen the chooser picked.

## A planning turn

- A planning turn routes by `## Route` and makes the offer on rung 3 only, because the user asked to choose there.
- On option A, it builds the comps and runs the picker as `## The comps` says, which changes no production code, and freezes the clicked contract.
- On option B, it freezes the contract the user's letter named the same way.
- On option C, or on any other rung, it writes the space file, deals `--plan --seed <token> --space <file> --variants 2`, keeps and fills one contract, `--check`s it, and freezes it with `--select --index 0 --space <file>`.
- The plan records the selection under `## Visual direction` as `Contract: docs/design/direction.json`.
- The plan carries that output verbatim in the Edit block of its first Build step, which writes that file.
- A read-only planning mode runs no `scripts/direction.mjs` call, because every mode of that script reads a file under `$RUN` and that mode refuses the write.
- In that mode the plan records `Direction: pending at rung <n>` under `## Visual direction` with the evidence that placed it there.
- The build session then runs Phase 2 from that rung before Build.

## Judgment

- A settled identity outranks a new direction unless the user or the brief lets it be replaced: it produces one direction and no offer.
- The user's own request for options is the only trigger for the offer; a landing page, an open identity or a full redesign is not.
- A click in the picker outranks this session's preference; an exit 3 makes the `--recommend` contract the selection without a further question.
