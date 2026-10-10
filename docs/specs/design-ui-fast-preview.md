# design-ui: fast sketch preview and lean lead reads

Evidence: `.exo/design-ui-cost/decisions.md` (closed decisions), `baseline.md` (10 transcripts), `loadmap.md` (static load per phase), `superpowers.md` (source research).

## Goal
A design-ui direction choice opens as a lead-written sketch round in the sketch tab within minutes, with no builder, capture or critique before the click, and the lead reads at most 30 KB of SKILL.md and references before that first preview.

## Decisions
- First preview = one sketch round on the existing sketch tab, not live comps: the lead writes it, `scripts/sketch-tab.mjs --serve "$RUN/sketches"` shows it, `--wait --sketch <file>` returns the click; no `exo:build-ui`, no capture, no screenshot read, no critique before the pick; a steer → the next numbered file, never a reused name (lead (user's standing instruction: recommended option); decision 1).
- The round is one file, `$RUN/sketches/<nnn>-directions.html`, holding one `data-choice` panel per direction, 2-3 (the Directions answer, else 3), side by side at 1280 wide, stacked below 700. Each panel shows that direction's first screen with real copy from the Phase 1 inventory, its own inline `<style>` from the direction's values, and at most 50 lines. One https font stylesheet serves every pair. The tab shows only the newest file in one iframe and keeps one answer per file, so one panel per direction in one file is the only form where one click picks (code: skills/design-ui/scripts/sketch-tab.mjs:178-189, :242, :523-531; skills/design-ui/references/sketch-tab.md:38, :42).
- Live stack comps (`pick.mjs` + `exo:build-ui comp:<n>`) run only when the user's own words ask for working or live comps, never as the default preview (lead (user's standing instruction: recommended option); decision 2).
- `pick.mjs` stays even when unused: `sketch-tab.mjs` imports nine of its functions (code: skills/design-ui/scripts/sketch-tab.mjs:39-42).
- Before the first preview the lead writes `$RUN/space.json` from `direction.mjs --shape` and runs one `--plan --seed <token> --space "$RUN/space.json" --variants <n> > "$RUN/contracts.json"`. It then derives per dealt contract only mood, palette, type pair and layout idea, and draws each panel from that contract's axes. After the click the lead fills only the picked contract, writes it as a one-contract container, runs `--check`, then `--select --index 0 > "$RUN/contract-selected.json"`. The seeded deal stays before the sketches because `--check` requires `--space` and fails a contract whose axes differ from a re-deal of its index; a one-contract container passes (lead, verified; code: skills/design-ui/scripts/direction.mjs:35-37, :491-505, :526, :636; skills/design-ui/references/phase-direction.md:51-56; decision 3).
- Preview read set (rung 3, or a Directions answer of 2-3) ≤ 30,000 B. It is SKILL.md whole plus these sections:
  - intake: `## Asking`, `## The direction offer`, `## The run directory`, `## Settled identity`
  - phase-detail: `## Context`, `## Precedence`, `## Judgment`
  - composition: `## Inventory before layout`
  - phase-direction: `## Mood to look`, `## Rung 3`, `## Judgment`
  - stack: `## Which stack`
  - typography: `## Pairing`
  - sketch-tab: `## The commands`, `## The direction round`, `## The answer`
  
  These move to after the pick on rung 3: phase-direction `## Every rung`, composition's Phase 2 sections, typography `## Source by character, not by list`, visual-direction, tokens, the rest of stack, and direction-preview. route-skills `question.md` leaves rung 3, since the offer text is fixed in intake (lead (user's standing instruction: recommended option); decision 4).
- One-pass lead read set ≤ 46,000 B. It is SKILL.md whole plus these sections:
  - intake: `## Asking`, `## The run directory`, `## Settled identity`
  - phase-detail: `## Context`, `## Precedence`, `## Judgment`
  - composition: `## Inventory before layout`, `## Turn subject evidence into a system`, `## Choose structures from relationships`, `## Write a composition contract`
  - phase-direction: `## Every rung`, `## Mood to look`, `## Judgment`
  - stack: `## Which stack`
  - visual-direction: every section but `## Contents`, `## Design context first` and `## Reference, variant, selection`
  - typography: `## Source by character, not by list`, `## Pairing`
  - tokens: `## Tiers`
  - build-pass: `## The build floor`, `## Proof`
  - phase-build: `## Where the build runs`, `## Capture, look, fix once`
  
  Adjusted from the 35 KB target: decision 5's trims (build-pass to two sections, the intake split, motion and stack Scaffold/Theme builder-only) reach about 44.4 KB measured from today's section bytes. Reaching 35 KB would need visual-direction (6.9 KB) or typography sourcing (2.7 KB) out of the lead's plan step, and no decision closes that (lead, writer; sizes: `.exo/design-ui-cost/loadmap.md` §2).
- One pass: build-pass is read by the lead as `## The build floor` and `## Proof` only; the builder keeps reading it whole. `## Asking` loses the rung-3 offer, its options and the sketch follow-ups to a new `## The direction offer`, read only on rung 3 or a Directions answer of 2-3. Motion and stack `## Scaffold`/`## Theme` become builder-only on the one pass. Each section is read once per run, and all sections a phase needs go in one message of parallel Reads (lead (user's standing instruction: recommended option); decision 5).
- Contradictions settled (decision 6, lead (user's standing instruction: recommended option)):
  - Comp captures: the comp builder reads them and the lead reads `comp-<n>.md` only. direction-preview.md:22 changes; phase-direction.md:68 stands.
  - Offer placement: the offer is the scope form's last question, in place of the Directions question (intake.md:64-65). phase-direction makes no second offer after `--check`.
  - Full-run capture: a full run replaces capture, look and fix (phase-detail.md:26). phase-build.md:48 narrows to the other routes.
  - Full-run `## Slop tropes`: builders and the critic read it, not the lead (agents/build-ui.md:48-49, agents/critique-ui.md:32, phase-detail.md:32). The SKILL.md:70 row drops it.
- Live comp builder loop: one check, one repair, one re-check for fresh captures, then report every fault left in `comp-<n>.md`. The picker needs captures newer than the comp's files (direction-preview.md:25), so the re-check stays; a second repair does not (lead (user's standing instruction: recommended option); decision 7).
- Lead `effort: high` stays (lead (user's standing instruction: recommended option); decision 8).
- One pass keeps build-ui writing the code and the lead reading 4 PNGs (code: skills/design-ui/SKILL.md:40; decision 9).
- `benchmarks/design-run.mjs` reports `firstPreviewMs`, in ms from the window start, or null when there is no preview. It is the earlier of two times: the first `sketches/*.html` mtime matching `^[A-Za-z0-9][\w.-]*\.html$`, and the timestamp of the first main-transcript Bash `tool_use` running `pick.mjs` without `--check`, inside the window. The transcript scan reads every line, because `responses()` keeps one line per `message.id` (lead, writer; code: benchmarks/design-run.mjs:64-82, :84-105, :135-145; skills/design-ui/scripts/sketch-tab.mjs:64; decision 10).
- Picker triggers stay rung 3 or a Directions answer of 2-3 (SKILL.md:31, :36). The offer promises sketches in about a minute instead of comps that take minutes (lead (user's standing instruction: recommended option); decision 11).
- Keep every pinned string and shape rule:
  - verify/checks/shared-contracts.mjs:48-103, :129-138
  - verify/self-test.mjs:188, :202-221, :252-265
  - tests/question-shape.test.mjs:89, the offer block must still pass `assertQuestionShape`, with no "(Recommended)" and no digit plus "tokens"
  - tests/designing-approval-status.test.mjs:13-19
  - tests/agents.test.mjs:72-264
  - tests/designing-render-names.test.mjs:41-111
  - verify/checks/reference-tables.mjs:11, :115-140: the 24 rows stay
  - verify/checks/reference-shape.mjs:119-124: a file over 100 lines links every heading in its contents list, and no reference links another reference
  - SKILL.md body ≤ 10,000 B (verify/budgets.mjs:47-48)
  
  (code: those paths.)
- Skill, agent and reference edits follow `skills/edit-skills/references/instruction-style.md` (code: CLAUDE.md `## Editing`).

## Baseline
- 10 runs, 2026-10-03..07: lead peak context median 146k (69k-296k); total tokens median 7.42M, 95%+ cache reads; wall median 17.2 min; first user-visible result median 17.2 min.
- Only picker run (#8 `1e9fc17b`): first preview 17.4 min. The direction phase added 109k to the lead. Two rounds of 3 live comps plus repairs took 11 build-ui (Sonnet 5.5) and 12.7M tokens, 88 min wall.
- Lead peak: lead-built pages median 174k; build-ui-built pages median 95k.
- Top lead fillers:
  - thinking 19%
  - code the lead wrote 17%
  - session baseline 15%
  - design-ui reference reads 13.5%: 5-47 reads per run, the same file up to 5 times
  - project reads 6%
  - images 4%, about 1.8k each
- Static: the preview path reads about 62 KB of SKILL.md and references before the first preview: direction-preview 10.8 KB whole, phase-direction 10.0 KB whole, visual-direction 8.7 KB, intake 8.4 KB. One pass reads about 54 KB. The lead reads build-pass (9.3 KB) whole, though the builder reads it whole too.
- superpowers v7.0.0 (`bb92a777`): the main session writes 2-4 small HTML fragments into a shared frame on a zero-dependency local server, with no subagent, screenshots or critique. The user clicks, the click lands in an events file, and each iteration is a new file.

## Acceptance
- Task 1: sketch-tab.md holds `## The direction round`.
- Task 1: phase-direction `## Rung 3` deals, sketches, waits, then fills, checks and selects the picked contract only.
- Task 1: `## The comps` opens only on the user's words asking for working or live comps.
- Task 2: direction-preview.md and build-ui.md cap the comp loop at one repair, and the comp builder alone reads comp captures.
- Task 3: intake.md holds `## The direction offer` with the sketch-round offer; `node --test tests/question-shape.test.mjs` passes.
- Task 4: SKILL.md routes rung 3 to the sketch round and its rows name the preview and one-pass read sets above; the body stays ≤ 10,000 B.
- Task 5: phase-build.md gives no `COMP` after a sketch pick and limits this session's capture to routes other than the full run.
- Task 6: `node --test tests/benchmark-design-run.test.mjs` passes with `firstPreviewMs` asserted for a sketch run, a picker run and a run with neither.
- Task 7: `node --test tests/design-ui-read-budget.test.mjs` passes. The preview set sums ≤ 30,000 B and the one-pass set ≤ 46,000 B.
- The Success criterion passes on the branch rebased onto `origin/main`.

## Manual checks
- A real rung-3 run on a typical page shows the first preview within 5 min of invocation.
- `node benchmarks/design-run.mjs --transcript <jsonl> --run <run dir>` shows `finalContext` under 100k for a one-pass run and for a full run.
- The sketch tab shows 2-3 direction sketches and one click picks a direction.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo
Branch: design-ui-fast-preview
Worktree setup: none
Land gate: npm run validate:static
Lint: none
Allow: none

## Success criterion
`npm run check` passes.

## Checkpoint
- Blocks first: Tasks 1 and 3.
- Parallel: Tasks 1, 2, 3, 5 and 6.
- Shared state: the preview read-set byte total across the sections Tasks 1, 3, 4 and 5 edit, summed by Task 7.
- Smallest safe split: one task per edited file group, the read-set test last.

## Tasks
### Task 1: feat(design-ui): open the direction choice as a lead-written sketch round
Depends on: none | Files: `skills/design-ui/references/sketch-tab.md`, `skills/design-ui/references/phase-direction.md` | Data: per instruction-style.md and the round, deal and live-comp Decisions: sketch-tab.md gains `## The direction round` (≤ 1,200 B, round file, panels, caps), and its line 3 owner sentence plus the single-axis rules (:30, :56) exempt that round; phase-direction `## Rung 3` (≤ 1,700 B) becomes deal, derive, sketch, `--serve`, `--wait`, then fill, `--check` and `--select` of the picked contract with no second offer; `## Every rung` :23 freezes on the round's click; `## The comps` drops :61 and opens only on a request for working or live comps | Proof: grep -c '^## The direction round' skills/design-ui/references/sketch-tab.md
### Task 2: fix(design-ui): cap the live comp loop at one repair and keep comp captures with the builder
Depends on: none | Files: `skills/design-ui/references/direction-preview.md`, `agents/build-ui.md` | Data: per instruction-style.md, `## Before the picker` :22 gives captures and `check-ui.json` to the comp builder and the lead `comp-<n>.md` only, :24 and `## Judgment` :115 become "repair once, re-check, report what is left", :31 opens comps only on the user's words asking for working or live comps, and build-ui's **Comp scope (`comp:<n>`)** step at :86 says "repair once" and reports remaining faults in `comp-<n>.md` | Proof: grep -c 'repair once' skills/design-ui/references/direction-preview.md agents/build-ui.md
### Task 3: feat(design-ui): move the direction offer to its own intake section and promise a quick sketch
Depends on: none | Files: `skills/design-ui/references/intake.md` | Data: per instruction-style.md, `## Asking` (≤ 4,000 B, keeps :18's pinned sentence) hands the offer, its options and the sketch follow-ups (:64-89) to a new `## The direction offer` (≤ 1,800 B, linked from `## Contents`) whose option A reads as sketches of the looks in your browser in about a minute, whose :51, :53 and :80 lines make the direction choice a sketch round, and whose :89 minutes warning applies to live comps only | Proof: grep -c '^## The direction offer' skills/design-ui/references/intake.md
### Task 4: feat(design-ui): route rung 3 to the sketch round and trim the lead's read sets
Depends on: 1, 3 | Files: `skills/design-ui/SKILL.md` | Data: per instruction-style.md and the read-set Decisions: `## Route` rung 3 points at `## The direction offer` and the sketch round; `## The one pass` step 4 reads build-pass `## The build floor` and `## Proof`; `## On request only` keeps live comps for a request for working comps; `## References` adds the read-once, one-message-of-parallel-Reads bullet; the rows of intake, question.md, phase-direction, build-pass (no lead `## Slop tropes`), stack, visual-direction, sketch-tab, direction-preview, composition, typography, tokens and motion name the two read sets | Proof: grep -c 'The direction round' skills/design-ui/SKILL.md
### Task 5: fix(design-ui): drop COMP after a sketch pick and leave full-run capture to the critic
Depends on: none | Files: `skills/design-ui/references/phase-build.md` | Data: per instruction-style.md, `## Where the build runs` :45 gives `COMP` only after live comps and nothing after a sketch round, and :48 limits this session's capture, look and judge to every route but the full run, which `## Full run` of phase-detail owns | Proof: grep -c 'sketch round' skills/design-ui/references/phase-build.md
### Task 6: feat(benchmarks): report time to first preview in design-run
Depends on: none | Files: `benchmarks/design-run.mjs`, `tests/benchmark-design-run.test.mjs`, `benchmarks/design-ui-tests.md` | Data: a `firstPreviewMs` number or null in the report object per the benchmark Decision, named in the header comment, asserted null at :69 and in two new tests (sketch mtimes, pick.mjs tool_use lines with a `--check` line ignored); design-ui-tests.md lines 3 and 32 read 100k, line 26 names the two build-pass sections, and a new checklist line wants `firstPreviewMs` under 300000 on a preview run | Proof: node --test tests/benchmark-design-run.test.mjs
### Task 7: test(design-ui): pin the lead's preview and one-pass read budgets
Depends on: 1, 3, 4, 5 | Files: `tests/design-ui-read-budget.test.mjs` | Data: two lists of `[file, heading]` pairs, the preview and one-pass sets of Decisions, each heading asserted present and sized from its line through the line before the next `## ` outside fences, with SKILL.md counted whole and sums asserted ≤ 30,000 and ≤ 46,000 | Proof: node --test tests/design-ui-read-budget.test.mjs
