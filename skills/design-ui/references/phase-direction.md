# Phase 2: Direction

Settle one direction from Phase 1 evidence before any production code changes. The enemy is a neutral middle that no region carries. The overcorrection is a picker offered to a user who did not ask to choose.

## Every rung

- Direction → decided in this session, never inside a builder delegate; this session holds the contract.
- No production code change before a selection exists; direction comps and their entry are not production code until the click promotes one.
- Outside an existing brand or design system → derive one bold direction from the chosen mood before Build; a neutral middle is not a direction.
- Direction settles composition and visual material together: contract names it, every region carries it.
- Plan names the user's three most important tasks, most frequent first; a screen ordered by its data serves no task.
- Layout order → by those tasks: first gets the most prominent region and nearest controls, third the least space.
- Each major layout choice → tag its plan line with the Laws of UX rule deciding it: Hick, Fitts, Jakob, Von Restorff or another.
- Before the plan → shortlist three faces and three accent hues, drop the first of each; the first to mind is the house default.
- Display font, body font, accent hue → one plan clause each naming this user and product, as in "for <user> <task> in <product>"; a reason that fits any page is no reason.
- Faces and hues → from the subject, the user and a named or saved product, never a seed.
- Plan ASCII layout → at most 8 lines per width; the plan holds at most 25 lines.
- Click or exit 3 arrives → freeze the selection and start Build in that turn; checked contracts are on disk and builders return reports of at most 20 lines.

## Mood to look

- Named or saved product → take its finish, density and motion, never its brand, logo or exact layout; a look-alike borrows that brand.
- Dare in one place: name one standout element the viewer remembers, such as a drenched KPI band; an all-equal page reads generic.
- Color with confidence: tint ground and surfaces from the palette, depth from surface steps, not white boxes carrying one accent.
- Vary block shape by content job: band, open table, inset panel and card differ, not one card anatomy repeated.
- These three hold in every mood, crisp, businesslike, strict and clean included; a quiet mood sharpens character, never removes it.
- Mood sets palette commitment, type character, corner and stroke shape, density and motion feel, never the amount of motion.
- Crisp and businesslike: tinted slate or ink surfaces, one committed accent region, compact rhythm, sharp corners, tabular figures, snappy precise easing on every motion of the motion bar.
- Friendly and playful: committed color, rounded shapes, warm humanist face, lively overshoot on entrances.
- Friendly and playful with an image generator → plan generated illustrations of the page's own content in the direction's palette; drawn character carries that mood.
- Generator prompt → this product's content and direction, never an existing product's characters, mascot or look.
- No image generator → Imagery trope of the `build-pass` reference holds: labelled placeholder, never a drawn stand-in.
- Calm and luxurious: tonal ground, generous space, refined type contrast, slow eased motion.
- Bold and expressive: saturated regions, heavy display type, hard edges, large travel.
- Mood → record in the contract's rationale, or the plan on the one pass; trace each look value to it.

## Rung 3

Rung 3 of the skill's `## Route`, reached only when the user asks to see or choose between looks (Directions answer 2 or 3 included), runs contract, variant, selection.

- Space, contracts, labels → write as JSON directly, never through a generator or fill script; the script costs the minutes it was meant to save.
- Axis space → derive from Phase 1 evidence, write as `$RUN/space.json` in the shape `scripts/direction.mjs --shape` prints.
- Deal contracts over the space's axes: `scripts/direction.mjs --plan --seed <token> --space "$RUN/space.json" --variants <n> > "$RUN/contracts.json"`.
- `--seed` → one token this session picks.
- `<n>` = Directions answer of the `intake` reference's form, else 3.
- Fill only the contract this session recommends; write it as a one-contract container to `$RUN/recommended.json`.
- `--check` the recommended contract to status ok.
- Ask nothing between `--check` and the first comp; the scope form already carried the offer or the Directions question.
- Make the offer `## Asking` of the `intake` reference defines, except after Directions answer 2 or 3, which takes the preview option at once.
- Select autonomously only when the user delegated the choice, took the second option, the picker exited 3, or a read-only planning mode allows no picker; record the rationale in the contract.
- Second option → freeze `$RUN/recommended.json` with `--select --index 0 --space "$RUN/space.json" > "$RUN/contract-selected.json"`.
- Every `--check` and `--select` call passes that `--space` file.

## The comps

Preview option, Directions answer 2 or 3, and a request to see directions whole → picker under the `direction-preview` reference; the sketch tab never shows a direction.

- Fill every dealt contract; write them as one container to `$RUN/finalists.json`.
- Next, validate the set with `--check` to status ok before building any variant, then write `$RUN/labels.json`.
- Stack comp → write the direction entry and start the dev server before any builder, per `## Stack comps` of `direction-preview`, so every builder renders through one URL.
- Dispatch one `exo:build-ui` per contract with `SCOPE: comp:<n>`, all in one message; comps built in this session fill its context before Build.
- Each builder gets `RUN`, `REPO`, `SKILL`, the `FILES` ranges holding the surface's content, and as `CHECK` its folder and `pick.mjs --check --variant <n>` command.
- Read only each builder's two-line return and its `$RUN/comp-<n>.md`, never a comp's source or capture; the builder checked and viewed them.
- Report with an open fault → send that comp back to its builder once before the picker opens.
- Start `pick.mjs` with `--comps "$RUN" --contracts "$RUN/finalists.json"` plus the builders' `--url` and `--source`; add `--frame 390x844` only for a phone-first surface.
- Picker prints the chosen index on a click, or exits 3 leaving the `--recommend` contract as the selection.
- `steer` in the answer = revision: change the comps it names, check again, start the picker once more.
- Freeze the selection with `--select --contracts "$RUN/finalists.json" --index <n> --space "$RUN/space.json" > "$RUN/contract-selected.json"` for Build, the critique, and QA.
- Then promote the chosen comp per `## After the click` of `direction-preview`.

## A planning turn

- Planning turn → routes by `## Route`, makes the offer on rung 3 only.
- Option A → build comps and run the picker per `## The comps` (no production code change), freeze the clicked contract.
- Option B → freeze the contract the user's letter named the same way.
- Option C or any other rung → write the space file, deal `--plan --seed <token> --space <file> --variants 2`, keep and fill one contract, `--check` it, freeze with `--select --index 0 --space <file>`.
- Plan records the selection under `## Visual direction` as `Contract: docs/design/direction.json`.
- Plan carries that output verbatim in the Edit block of its first Build step, which writes that file.
- A read-only planning mode runs no `scripts/direction.mjs` call, because every mode of that script reads a file under `$RUN` and that mode refuses the write.
- In that mode → plan records `Direction: pending at rung <n>` under `## Visual direction` with the evidence that placed it there.
- Build session then runs Phase 2 from that rung before Build.

## Judgment

- Settled identity outranks a new direction unless user or brief lets it be replaced: one direction, no offer.
- Only the user's own request for options triggers the offer; a landing page, open identity or full redesign does not.
- Picker click outranks this session's preference; exit 3 makes the `--recommend` contract the selection, no further question.
