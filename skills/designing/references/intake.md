# Intake

Settle what the run needs before it builds: the questions worth asking, where the run writes, and which reference the complaint's own words point at. The enemy is a run that starts building on a fact nobody established. The overcorrection is an interview that asks for what the surface already shows.

## Asking

Name the decision an answer changes before asking anything; a question with no named decision is not asked. Then sort it by one test: would the user answer it better by seeing it? Color, type, spacing, layout, motion, imagery and every other choice between looks is a visual choice. A visual choice is never a terminal question, because a color named in words is not the color the user would see. It reaches the user as a sketch in the browser tab, or it is decided and never asked.

- A one-line brief is not a reason to ask. Derive the three Phase 1 facts, state them in one line as assumptions, and build.
- Rungs 3 and 7 of `## Route` offer the preview once, and render nothing before the answer. The offer is its own message with nothing else in it, sent where the direction is the open question. It names the decision, which direction the build takes, and the price in plain words: one browser tab opens and stays open for the session, each visual choice appears in it as a rough sketch within about half a minute, a sketch costs about 1,000 extra tokens, one click answers, and deciding without it costs nothing extra. Two options in the question shape end the message, and the user answers with the digit:

  ```text
  1. **Browser preview (Recommended)**: open one tab and sketch the <n> directions in it
  2. **Decide for me**: build <title of the recommended contract>
  ```

  An offer that drops the price is not the offer, because a chooser who was not told the price did not agree to it. The preview option starts `scripts/sketch-tab.mjs --serve` and writes the first sketch in the same message, under the `sketch-tab` reference; the click names the contract that the `phase-direction` reference then freezes. Every later visual choice, and every revision the user asks for, is one more sketch file in that tab, with no second offer.
- On the second option, or an exit 3, no visual question is asked for the rest of the session: the `--recommend` contract is the selection, each further visual choice is decided from the contract and Phase 1 evidence and stated in one line, the choice and what it costs if wrong and never why, and a correction is applied without a question back. The exception is a user who then asks to see options, which opens the tab with no second offer.
- Full comps through `pick.mjs` are built only when the user asks to see a direction whole, for the directions the sketches left standing, and the message names their price first: about 3,500 extra tokens per direction and one to three minutes.
- Scope, content, data and behavior are terminal questions, because a question about a visual topic is not a visual question. Beyond the offer, ask one only while an unanswered fact blocks a decision the brief, the repository, and Phase 1 evidence cannot settle, and name that decision inside the question; a visual choice is never that fact. Stop after two rounds, then state the assumption and build.
- A planning turn routes by `## Route` and makes the offer on rungs 3 and 7, because a direction frozen without it was chosen for the user. On the preview option it runs the sketch tab under `$RUN`, which writes nothing in the repository, and freezes the clicked contract as the `phase-direction` reference says; on the second option, or on any other rung, it writes the space file, deals `--plan --seed <token> --space <file> --variants 2`, keeps and fills one contract, `--check`s it, and freezes it with `--select --index 0 --space <file>`, adding `--candidates <file>` when fonts came from the candidate gate. Either way the plan records the selection under `## Visual direction` as `Contract: docs/design/direction.json`, and that output is carried verbatim in the Edit block of the plan's first Build step, which writes that file. The exception is a read-only planning mode, which runs no `scripts/direction.mjs` call, because every mode of that script reads a file under `$RUN` and that mode refuses the write: the plan records `Direction: pending at rung <n>` under `## Visual direction` with the evidence that placed it there, and the build session runs Phase 2 from that rung before Build.

## The run directory

Every run past a tweak writes under one directory outside the repository, `/private/tmp/designing/<repository basename>-<YYYYMMDD-HHMM>/`, called `$RUN` below, created before Phase 1 and named once in the transcript. It holds `context.json`, `contracts.json`, `recommended.json`, `contract-selected.json`, `font-candidates.json`, `sketches/`, `variant-<n>/`, `renders/`, and the run reports inventory.md, foundation.md, `build-<surface>.md` and faults.md. Every `node scripts/*.mjs` call redirects stdout into `$RUN` and the session reads the fields it needs with `jq` or `sed -n`, never the whole file: a JSON line that reaches the transcript is carried into every turn after it. `direction.mjs --select` prints the frozen contract; the redirect into `$RUN/contract-selected.json` is what writes it. Agents receive `$RUN` and exchange files under it; they return reports, never file contents.

## Symptoms

A complaint names a fault in the words of the person who saw it, and those words are not the words the fault is written under. This table is the only step between the two: it says which file owns the symptom, and that file's own row above says when it may be read. A symptom with no row here is diagnosed in Phase 4, not guessed at.

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

Rung 5 of the skill's `## Route` reads any one of these as a settled identity: docs/design/DESIGN.md with a `scripts/context.mjs` status other than `absent`, docs/design/direction.json, a `contract-selected.json` under a run directory named for this repository, or a stylesheet, theme config or DTCG file that names both color and type values and has changed in at least one commit after the commit that added it.

## Judgment

- A named decision outranks a question that reads as thorough: a question with no decision behind it is not asked.
- The complaint's own words outrank a category label when routing to a reference.
- One run directory outranks a tidier path inside the repository: a render written into the tree is a render committed by accident.
