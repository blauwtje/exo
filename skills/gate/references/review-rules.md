# Review rules for fix findings

The dispatcher reads `## Dispatch` only on `BLOCKED`, a resume or a `fix diff`; `--reviews-only` prints the step 2 fields.

## Dispatch

- Pass the DISPATCH line's `code-standard=` path, unresolved, and `input=` when present.
- Pass this file's path, the plan, branch, checkout and base, and scope `branch <base>..HEAD` from `REVIEW Branch` or `overlap` with the `OVERLAP` lines.
- Pass the findings path, the input to `merge-reviews.mjs`: `branch` uses `<checkout>/.exo/review-branch.md`, `overlap` `<checkout>/.exo/review-overlap.md`.
- For scope `fix diff`, the findings path is `<checkout>/.exo/fix-review.md`, the input to repair step 3; it never goes to `merge-reviews.mjs`.
- For scope `branch`, pass 3-5 questions from the plan's Goal and each task's `Data:`, `Risk:` and Acceptance.
- The reviewer reads only the plan, diff and `Red:` lines; its only `Red:` source is `## Red lines` of the dispatch's `input=` file, else `<checkout>/.exo/review-input.md`.
- When the reviewer returns with no file at its findings path, whatever its return line says (`BLOCKED`, `CLEAN` included), resume it once with SendMessage, per `${CLAUDE_PLUGIN_ROOT}/hooks/session-rules.md`, before any `BLOCKED` handling, and name the path and its consumer. Without SendMessage, dispatch a fresh agent with the prior result path.
- With the file still missing, `merge-reviews.mjs` merges that path as `BLOCKED` for scope `branch` or `overlap`; scope `fix diff` ends the turn at repair step 2.
- A merged `verdict=BLOCKED` ends the turn with its report, naming each findings path without a file; resume and redispatch no more.
- When the merge prints `UNREAD <n>`, list each unread finding in the `REPORT` file as `report` and name the count; dispatch no fixer and rerun or rewrite nothing.

## Probe

- A probe is one read-only shell command, run from the root, exiting non-zero now and zero once fixed; run it once, keep only a non-zero exit, and mark a finding with no probe `report`.
- With `ledger=` (round 2 or later), raise `fix` only for a defect inside the fix diff or an earlier round's `Sweep:` hit, `concern` likewise; other defects become `report`, other concerns `note`.
- A sweep matches the defect form, not its repair, and prints nothing once all hits are repaired.
- The fix diff is the commits in `<base>..HEAD` without a `Plan-task:` trailer.

## Scope

- For scope `fix diff <pre-fix-sha>..HEAD`, the diff is `git diff <pre-fix-sha>..HEAD`, skipping task-by-task checks.
- For scope `branch <base>..HEAD`, the diff is `git diff <base>...HEAD`; read the whole plan and answer each question with evidence first.
- For scope `overlap`, read each listed file and the named tasks' commits; report only a name, signature or reference two tasks disagree on.

## Report

- An `out-of-scope` finding is an input class under a task's `Boundary:` `out`, marked `report`.
- End with `Count:` per weight, `Read: <paths>` for every file read, and `Unread:` (paths or `none`).
