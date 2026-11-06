# Triage lines

Read it when writing review findings, and when the merge prints `UNCITED`, `CATEGORY` or a hidden count.

## Lines

- Ask for every finding, then re-read each against the diff and add last under it `  Cite: <file:line>`, `  Score: <1-10>` and `  Category: <one word>`, after any fix lines.
- `Cite:` is the rule the finding breaks: a line of the repo's `CLAUDE.md`, `.claude/*.md`, `docs/principles/*.md`, a plan Success criterion or the review rules file. A cite past the end of its file counts as none.
- `Score:` is the finding's usefulness to the author: 9-10 a defect to fix, 5-8 worth a look, 1-4 a nit. The finding line is its headline and the lines beneath are its detail.

## Merge

- A report holding any triage line demotes each finding with no valid `Cite:`: `fix` becomes `report`, `concern` becomes `note`, and it lists under `CATEGORY uncited` with an `UNCITED <n>` count. The `code-rules` report is exempt.
- A finding scored under 4 is demoted alike and left out of the `FINDING` lines, which group by `CATEGORY` and sort by score. The merge prints `<n> findings under score <t> hidden`; `--min-score <n>` or `EXO_REVIEW_MIN_SCORE` sets `<t>`, and `--min-score 1` lists every finding.
- A fixer records `Before: pass` or `Before: fail` under a finding: the exit status of its `Probe:` run before the fix. `run-probes.mjs` demotes a fixed finding with `Before: pass` (`DEMOTED-PREPASS`), logs it `declined`, and does not rerun its probe, because a probe that passed before the fix proves nothing.
- Put the counts in `REPORT`; the merge report file keeps every finding.
