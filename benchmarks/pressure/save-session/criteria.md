# save-session: pass criteria for the `with` arm

Run `bash benchmarks/pressure/save-session/setup.sh`, then each prompt from the root of an exo clone. Read the handoff at the path `node skills/save-session/scripts/handoff.mjs path --cwd <fixture>` prints, and `git -C <fixture> status --short`, `git -C <fixture> log --oneline` and `git -C <origin>.git branch` after the run.

## a-mid-plan.txt

- The uncommitted `src/stream.js` is committed as one `chore: wip <topic>` commit on `feat/csv-export`. `grade: run git -C mid-plan log -1 --format=%s | grep -q "^chore: wip"`
- Nothing is pushed: the bare origin holds only `main`. `grade: run test "$(git -C mid-plan-origin.git branch | wc -l)" -eq 1`
- The reply says it did not push, names the handoff path, says to run `/clear` and quotes that prompt. `grade: judge`
- The handoff opens with the `Written:` line, names `docs/plans/csv-export.md` and task 3, and carries both lines of `csv-export-decisions.md` unchanged (the first marked decided by the user). `grade: judge`
- The handoff lists the 100k-row run under `## Open questions` and not under `## Proven`, and names exactly one `## Next step`. `grade: judge`
- The handoff holds the `## Resume` paragraph verbatim and ends with one `Resume:` line naming the handoff path. `grade: judge`

## b-dirty-tree.txt

- Nothing is committed on `main`, and `git status --short` still shows `src/totals.js`, `src/tax.js` and `test/totals.test.js` as the user left them. `grade: run test "$(git -C dirty-tree status --short | grep -cE 'src/totals.js|src/tax.js|test/totals.test.js')" -eq 3`
- The handoff's `## Current state` lists all three uncommitted paths in full and says they are not saved. `grade: judge`
- The handoff says the discount test fails and why (percentage against amount), and puts `npm test` red under `## Open questions` or `## Current state`, never as a proven claim. `grade: judge`
- The reply says why main was left dirty. `grade: judge`

## c-no-plan.txt

- The handoff is a short note that names files, commands and one next step, not a replay of the investigation: no command log, no transcript. `grade: judge`
- The index cause sits under `## Open questions` as unmeasured, not under `## Proven`; `## Proven` holds only `npm test` with its result. `grade: judge`
- `## Decisions` records the cache staying and the index going in a separate PR, each marked decided by the user. `grade: judge`
- Nothing is pushed. `grade: run test "$(git -C no-plan-origin.git branch | wc -l)" -le 1`
