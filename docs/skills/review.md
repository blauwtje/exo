# review

Reviews a change that has no plan, with the reviewer and rules the gate uses, and changes nothing.

## When it runs

Only when you type `/exo:review [base..head, commit, branch or pull request number]`. With no argument it reviews your uncommitted work.

Not for a plan's branch (`gate`), a repair (`build`) or a pull request's review comments (`ship`).

## What you get

- Findings on the lines the target changed, each with its `file:line`, a cited rule, a score and a category, grouped and ordered as the gate's findings are.
- Findings with no cited rule or a score under 4 are counted, not listed.
- Nothing is repaired, committed or posted to a pull request; repairs go through `build`.

## Source

- skills/review/SKILL.md
- skills/review/scripts/resolve-target.mjs
- skills/gate/references/triage.md
