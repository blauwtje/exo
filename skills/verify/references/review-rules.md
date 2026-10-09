# Review rules for fix findings

Branch reviewer follows these when the dispatch names this file.

## Dispatch

- Pass: code standard path from `CLAUDE.md` or `AGENTS.md`, else `${CLAUDE_SKILL_DIR}/../route-skills/references/code-standard.md`.
- Pass: this file's path, plan path, branch, checkout, base, implementer report directory `<checkout>/.exo/`.
- Pass: scope `task <shas>` from the `REVIEW` line, or `overlap` with the `OVERLAP` lines.
- No `REVIEW` line (run-unit) → shas from `git log --format=%h --grep "^Plan-task: <plan id>/<n>$"`; the anchors keep `<n>` from matching `<n>0`..`<n>9`.
- Pass: report path `<checkout>/.exo/review-<sha7>.md`, sha7 from the line's first sha; for `overlap`, `<checkout>/.exo/review-overlap.md`.
- Scope `task` → also pass three to five concrete questions, written from the task's heading, `Data:`, `Risk:` and Acceptance line.
- Reviewer reads only the plan, diff and implementer `Red:` lines.
- Reviewer return with no report file at its report path, whatever its return line → still pass that path to `merge-reviews.mjs`, which merges it as `BLOCKED`.
- Merged `verdict=BLOCKED` → end the turn with its report, naming each task without a report; no resume, no redispatch.
- Merge prints `UNREAD <n>` → list each unread finding in the `REPORT` file as `report`, name the count in the message; no fixer dispatch, no rerun, no rewriting the finding into one-line shape.

## Probe

- Each `fix` finding → line `  Probe: <command>` directly under it.
- Probe = one read-only shell command, run from the root, exiting non-zero now and zero once fixed.
- Run each probe once; keep it only if it exits non-zero; no such probe → mark the finding `report`.

## Scope

- Scope `fix diff` → diff is `git diff HEAD` plus files `git ls-files --others --exclude-standard` lists, not base to HEAD.
- Scope `fix diff` → skip every task-by-task check.
- Scope `task <shas>` → diff is `git show <shas>`; read only that task's plan section; answer each question with evidence before the standard pass.
- Scope `task <shas>` → skip the checks against the plan's goals and other tasks.
- Scope `overlap` → read each listed file and the named tasks' commits; report only a name, signature or reference two tasks disagree on.
