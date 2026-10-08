# Intake

Settle what the run needs before building: questions worth asking, where the run writes, which reference the complaint's words point at. The enemy is a run that starts building on a fact nobody established. The overcorrection is an interview that asks for what the surface already shows.

## Contents

- [Asking](#asking)
- [The run directory](#the-run-directory)
- [Symptoms](#symptoms)
- [Settled identity](#settled-identity)
- [Judgment](#judgment)

## Asking

- Visual choice = color, type, spacing, layout, motion, imagery, any choice between looks.
- Visual choice → never a terminal question, except option B; a named color is not the seen color.
- Visual choice → reaches the user as a sketch, as one plain-words question after option B, or is decided.
- Name the decision an answer changes before asking anything; a question with no named decision is not asked.
- Sort each question by one test: would the user answer it better by seeing it?
- Scope, content, data, behavior → terminal questions; a question about a visual topic is not a visual question.
- Beyond the form and the offer → ask only while an open fact blocks a decision brief, repository and Phase 1 cannot settle; name that decision inside the question.
- Rungs 3, 5 and 6 of `## Route` → show the completed scope as one form, after Phase 1, before Direction.
- Form order: single-select Users question, multi-select Scope question, single-select Directions question.
- Product or style question → never ask; a product or style counts only when the user names one in the ask.
- `header` tab → conversation's language, at most 12 characters: Users "For whom", Scope "What's in", Directions "Designs".
- Every question and option → plain words for someone without design knowledge.
- No jargon or abbreviation in a tab, question or option, such as scope, reference, directions or SLA, in any language.
- Users question first; the user the screen serves decides its layout, density and main action.
- Users options → three or four people Phase 1 evidence suggests, in everyday words: who, which device, how often, doing what.
- Best-evidenced user → option A, recommended.
- Scope options → at most four, each one completed scope group from the inventory.
- Scope option name → what the user will see on screen, not an inventory group label.
- Reachable states and fixed scope groups of an admin, dashboard or tool screen → never a Scope option; the build always carries them.
- Scope answer ticks every option, none, or says decide yourself → build every group.
- Scope answer ticks some → build ticked groups plus every fixed group.
- Before the form → run `node <skill dir>/scripts/reference.mjs --root <repository>`; prints the product saved in docs/design/DESIGN.md, or nothing.
- Saved product → state in one line, "Look: <product>, from DESIGN.md"; each project keeps its own look.
- Product or style the ask names → wins over the saved product.
- `reference.mjs --set "<name>" --root <repository>` → only for a product or style the user named.
- Named or saved product → sets the mood, the nearest of the four in `## Mood to look` of the `phase-direction` reference.
- No product → choose that mood yourself from the user, the subject and any mood the ask names.
- `display-font`, `body-font` or `accent` in DESIGN.md's front matter = saved pick: plan reuses it, shortlists only the missing picks.
- Plan names its picks → save each new one with `reference.mjs --display-font "<font>" --body-font "<font>" --accent "<color>" --root <repository>`.
- Then run `node <skill dir>/scripts/picks.mjs --project <repository> --display "<font>" --body "<font>" --accent "<color>"`; prints the picks line, each repeated pick marked "also used in <n> earlier projects".
- Before the first product edit → send that printed line to the user, translated into the conversation's language, also when no product was named.
- Send it whole; a line rewritten from the plan drops the repeat marks.
- Repeat → warns, blocks nothing: no question about it, keep the picks; the user decides whether to steer.
- `picks.mjs` failure → drops the warning, never the run; the line says the earlier-project check did not run.
- Directions question → "How many designs should I show you first?" in the conversation's language, options 1, 2, 3 in order.
- Option 1 wording → build one design right away; options 2 and 3 → show that many to choose from.
- Directions 1 → run stays on its rung: one direction, no sketch.
- Directions 2 or 3 → asks to choose: rung 3 of `## Route` follows with that many directions, taking option A without the offer.
- Those directions → first-screen comps in the picker under the `direction-preview` reference, never a sketch; a sketch hides how a direction looks as a product.
- Rung 5 → drop the Directions question; its settled identity fixes the look.
- Ask names its user → drop the Users question.
- Ask says decide yourself → drop the whole form.
- No answer can arrive, as in a headless run → send no form.
- No Scope answer → build every group, named in one line before Direction.
- No Users answer, or decide yourself → the user the ask names, else option A's user.
- No Directions answer, or decide yourself → one direction.
- Before Direction → state the user in one line (role, device, how often, main task) and write it to `$RUN/user.md`.
- Rung 3 of `## Route`, a user asking to see or choose between looks → offer the preview once; no other rung offers it.
- Offer → form's last question, in place of the Directions question.
- Offer follows the question shape; user answers with the letter:

  ```text
  **How should we pick the new look?**
  I will make <n> looks. You can see them first or let me choose.

  - **(A) Show me**: open each of the <n> full screen in your browser, one at a time.
  - **(B) Describe them**: I explain each look here in a few words.
  - **(C) You choose**: I build <the recommended look in plain words>.

  Recommended: (A), because seeing the looks beats reading about them, and (C) skips your say.
  ```

- Option A → build first-screen comps, open the picker under the `direction-preview` reference; the click names the contract the `phase-direction` reference then freezes.
- Every later visual choice the user asks to see → one sketch in the sketch tab under the `sketch-tab` reference, no second offer.
- Option B → one more question whose options are the looks, each one plain line.
- Option B letter → names the contract the `phase-direction` reference freezes, as a click would.
- After option B → each later visual choice decided from the picked contract as on option C, unless the user asks to see it.
- Option C or exit 3 → the `--recommend` contract is the selection.
- After option C or exit 3 → no visual question for the rest of the session; decide each further visual choice from the contract and Phase 1 evidence.
- User then asks to see options → opens the tab, no second offer.
- Each such choice → one line: the choice and its cost if wrong, never why.
- Correction → apply without a question back.
- Before full comps through `pick.mjs` → say in plain words each takes a few minutes.

## The run directory

- Every run past a tweak, one pass included → writes under one directory outside the repository, `/private/tmp/designing/<repository basename>-<YYYYMMDD-HHMM>/`, called `$RUN` below; create before Phase 1, name once in the transcript.
- Every `node scripts/*.mjs` call → redirect stdout into `$RUN`; read needed fields with `jq` or `sed -n`, never the whole file; a JSON line in the transcript is carried into every later turn.
- `$RUN` holds user.md, `context.json`, `contracts.json`, `recommended.json`, `contract-selected.json`, `sketches/`, `variant-<n>/`, `renders/`, and run reports inventory.md, foundation.md, `build-<surface>.md`, faults.md.
- Each pass → own numbered report `build-<n>.md`; after its last checkpoint copy `renders/` to `renders-<n>/`, `<n>` = pass number from 1, so no pass overwrites an earlier one.
- `direction.mjs --select` prints the frozen contract; the redirect into `$RUN/contract-selected.json` writes it.
- Agents receive `$RUN`, exchange files under it, return reports, never file contents.

After a compaction notice → resume from the newest `/private/tmp/designing/*/` run directory, not the conversation: Build reopens from its `contract-selected.json`; `renders/` shows checkpoints reached.

## Symptoms

Complaint wording → owning file below; that file's row in the skill's References table says when to read it. Symptom with no row → diagnose from the capture the one pass reads, not a guess.

| Reported as | Owned by |
|---|---|
| flat, cheap, unfinished, generic, or like a template | `build-pass` `## Slop tropes`, `visual-critique` `## Unsupported-pattern test` |
| empty, bare, or too much white space | `composition` `## Build density without clutter`, checked against each quiet region's named job in `visual-direction` |
| cluttered, noisy, or hard to scan | `composition` for grouping and pacing, `typography` `## Scale` for hierarchy |
| cramped, misaligned, or spaced inconsistently | `implementation`, `component-system` `## Scales, not values` |
| the type reads wrong, dated, or hard to read | `typography` |
| the colours look muddy, garish, or washed out | `visual-direction` `## Palette`; `tokens` past the role tokens |
| the page jumps, stalls, or feels slow to arrive | `performance-budget` for the cause; `feedback-and-status` for what shows while it waits |
| the motion distracts, or nothing seems to respond | distracts → `motion`; no response → `interaction-qa` |

## Settled identity

Rung 5 of the skill's `## Route` reads any one of these as settled identity:

- docs/design/DESIGN.md where `scripts/context.mjs --status` reports `design_context_status` other than `absent` and `approval_status` of `approved`.
- docs/design/direction.json.
- A `contract-selected.json` under a run directory named for this repository.
- A stylesheet, theme config or DTCG file that names both color and type values and has changed in at least one commit after the commit that added it.

A `draft` `approval_status` is not settled.

- Draft → route past rung 5 without opening DESIGN.md's body.

## Judgment

- The complaint's own words outrank a category label when routing to a reference.
- One run directory outranks a tidier path inside the repository; a render written into the tree gets committed by accident.
