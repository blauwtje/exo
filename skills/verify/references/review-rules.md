# Review rules for fix findings

Branch reviewer follows these when the dispatch names this file. Dispatcher reads `## Dispatch` only on `BLOCKED`, a resume or a `fix diff`; `--reviews-only` prints the step 2 fields.

## Dispatch

- Pass: the DISPATCH line's `code-standard=` path, unresolved.
- Pass: this file's path, plan path, branch, checkout, base.
- Pass: scope `branch <base>..HEAD` from `REVIEW Branch`, or `overlap` with the `OVERLAP` lines.
- Pass: findings path, input to `merge-reviews.mjs`: scope `branch` → `<checkout>/.exo/review-branch.md`; scope `overlap` → `<checkout>/.exo/review-overlap.md`.
- Scope `fix diff` → findings path `<checkout>/.exo/fix-review.md`, input to verify's repair step 3, never to `merge-reviews.mjs` (it would overwrite `<checkout>/.exo/branch-review.md`).
- Scope `branch` → also pass three to five concrete questions, written from the plan's Goal and each task's `Data:`, `Risk:` and Acceptance line.
- Reviewer reads only the plan, diff and `Red:` lines; its only `Red:` source is `## Red lines` of `<checkout>/.exo/review-input.md`.
- Reviewer return with no file at its findings path, whatever its return line (`BLOCKED` and `CLEAN` included) → dispatcher resumes it once with SendMessage, before any `BLOCKED` handling, naming the path and its consumer. SendMessage unavailable → dispatch a fresh agent with the prior result path.
- File still missing → scope `branch` or `overlap`: pass that path to `merge-reviews.mjs` anyway, which merges it as `BLOCKED`; scope `fix diff`: repair step 2 ends the turn.
- Merged `verdict=BLOCKED` → end the turn with its report, naming each findings path without a file; no second resume, no redispatch.
- Merge prints `UNREAD <n>` → list each unread finding in the `REPORT` file as `report`, name the count; no fixer dispatch, no rerun, no rewriting into one-line shape.

## Probe

- Each `fix` finding → line `  Probe: <command>` directly under it.
- Probe = one read-only shell command, run from the root, exiting non-zero now and zero once fixed.
- Run each probe once; keep it only if it exits non-zero; no such probe → mark the finding `report`.
- DISPATCH line has `ledger=` (round 2 or later) → raise `fix` only for a defect inside the fix diff, or one an earlier round's `Sweep:` prints; any other defect → `report`.
- Sweep = the defect form: it matches the defect and not its repair, so it prints nothing once every hit is repaired.
- Fix diff = the commits in `<base>..HEAD` with no `Plan-task:` trailer.

## Scope

- Scope `fix diff` → diff is `git diff HEAD` plus files `git ls-files --others --exclude-standard` lists, not base to HEAD; skip every task-by-task check.
- Scope `branch <base>..HEAD` → diff is `git diff <base>..HEAD`; read the whole plan; answer each question with evidence before the standard pass.
- Scope `overlap` → read each listed file and the named tasks' commits; report only a name, signature or reference two tasks disagree on.
