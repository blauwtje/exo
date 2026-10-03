# Intake

Settle what the run needs before it builds: the questions worth asking, where the run writes, and which reference the complaint's own words point at. The enemy is a run that starts building on a fact nobody established. The overcorrection is an interview that asks for what the surface already shows.

## Asking

- A visual choice is never a terminal question, except the Mood question and option B, because a named color is not the seen color.
- Color, type, spacing, layout, motion, imagery and every other choice between looks is a visual choice.
- A visual choice reaches the user as a sketch, as the Mood question, as one plain-words question after option B, or it is decided.
- Name the decision an answer changes before asking anything; a question with no named decision is not asked.
- Sort each question by one test: would the user answer it better by seeing it?
- Scope, content, data and behavior are terminal questions, because a question about a visual topic is not a visual question.
- Beyond the form and the offer, ask only while an open fact blocks a decision the brief, repository and Phase 1 cannot settle.
- Name that decision inside the question.
- Rungs 3, 5 and 6 of `## Route` show the completed scope as one form, after Phase 1 and before Direction.
- The form holds a multi-select Scope question and a single-select Mood question, sent together.
- Each Scope option is one completed scope group from the inventory, at most four.
- Reachable states and an app screen's fixed scope groups are never a Scope option, because every build carries them.
- A Scope answer that ticks every option, ticks none, or says decide yourself builds every group.
- A Scope answer that ticks some options builds the ticked groups plus every fixed group.
- The Mood options are crisp and businesslike, friendly and playful, calm and luxurious, bold and expressive.
- Put the mood that best fits the product first, as option A, and recommend it.
- Rung 5 drops the Mood question, because its settled identity already fixes the look.
- An ask that names a mood drops the Mood question.
- An ask that says decide yourself drops the Scope and Mood questions.
- Send no form when no answer can arrive, as in a headless run.
- Without a Scope answer, build every group, named in one line before Direction.
- Without a Mood answer off rung 5, take the mood the ask names, else the best-fitting mood, named in one line before Direction.
- Rung 3 of `## Route`, a user asking to see or choose between looks, gets the preview offer once, as the form's last question, so the user answers one form; no other rung offers it.
- The offer follows the question shape, and the user answers with the letter:

  ```text
  **How should we pick the new look?**
  I will make <n> looks. You can see them first or let me choose.

  - **(A) Show me**: open all <n> side by side in your browser.
  - **(B) Describe them**: I explain each look here in a few words.
  - **(C) You choose**: I build <the recommended look in plain words>.

  Recommended: (A), because seeing the looks beats reading about them, and (C) skips your say.
  ```

- Option A opens the sketch tab under the `sketch-tab` reference; the click names the contract that the `phase-direction` reference then freezes.
- Every later visual choice, and every revision the user asks for, is one more sketch file in that tab, with no second offer.
- Option B is one more question whose options are the looks, each in one plain line.
- The letter on option B names the contract the `phase-direction` reference freezes, as a click would.
- After option B, each later visual choice is decided from the picked contract as on option C, unless the user asks to see it.
- On option C, or an exit 3, the `--recommend` contract is the selection.
- After option C or an exit 3, no visual question is asked for the rest of the session: each further visual choice is decided from the contract and Phase 1 evidence.
- When the user then asks to see options, that opens the tab with no second offer.
- State each such choice in one line, the choice and what it costs if wrong and never why.
- Apply a correction without a question back.
- Before full comps through `pick.mjs`, say in plain words that each one takes a few minutes.

## The run directory

- Every run past a tweak, the one pass included, writes under one directory outside the repository, `/private/tmp/designing/<repository basename>-<YYYYMMDD-HHMM>/`, called `$RUN` below, created before Phase 1 and named once in the transcript.
- Redirect every `node scripts/*.mjs` call's stdout into `$RUN` and read the fields the session needs with `jq` or `sed -n`, never the whole file, because a JSON line that reaches the transcript is carried into every turn after it.
- `$RUN` holds `context.json`, `contracts.json`, `recommended.json`, `contract-selected.json`, `font-candidates.json`, `sketches/`, `variant-<n>/`, `renders/`, and the run reports inventory.md, foundation.md, `build-<surface>.md` and faults.md.
- `direction.mjs --select` prints the frozen contract; the redirect into `$RUN/contract-selected.json` is what writes it.
- Agents receive `$RUN` and exchange files under it; they return reports, never file contents.

**After a compaction notice**, resume from the newest `/private/tmp/designing/*/` run directory, not the conversation: Build reopens from its `contract-selected.json`, and `renders/` shows the checkpoints reached.

## Symptoms

A complaint names a fault in the words of the person who saw it, and this table says which file owns that symptom; the file's own row in the skill's References table says when it may be read. A symptom with no row here is diagnosed from the capture the one pass reads, not guessed at.

| Reported as | Owned by |
|---|---|
| flat, cheap, unfinished, generic, or like a template | the `visual-critique` reference, its `## Slop tropes` and `## Unsupported-pattern test` |
| empty, bare, or too much white space | the `composition` reference, its `## Build density without clutter`, against every quiet region's named job in the `visual-direction` reference |
| cluttered, noisy, or hard to scan | the `composition` reference for grouping and pacing, the `typography` reference its `## Scale` for the hierarchy |
| cramped, misaligned, or spaced inconsistently | the `implementation` reference, and the `component-system` reference its `## Scales, not values` |
| the type reads wrong, dated, or hard to read | the `typography` reference |
| the colours look muddy, garish, or washed out | the `visual-direction` reference its `## Palette`, and the `tokens` reference past the role tokens |
| the page jumps, stalls, or feels slow to arrive | the `performance-budget` reference for the cause, the `feedback-and-status` reference for what is shown while it waits |
| the motion distracts, or nothing seems to respond | the `motion` reference for the first, the `interaction-qa` reference for the second |

## Settled identity

Rung 5 of the skill's `## Route` reads any one of these as a settled identity:

- docs/design/DESIGN.md where `scripts/context.mjs --status` reports `design_context_status` other than `absent` and `approval_status` of `approved`.
- docs/design/direction.json.
- A `contract-selected.json` under a run directory named for this repository.
- A stylesheet, theme config or DTCG file that names both color and type values and has changed in at least one commit after the commit that added it.

A `draft` `approval_status` is not settled.

- On a draft, route past rung 5 without opening DESIGN.md's body.

## Judgment

- The complaint's own words outrank a category label when routing to a reference.
- One run directory outranks a tidier path inside the repository: a render written into the tree is a render committed by accident.
