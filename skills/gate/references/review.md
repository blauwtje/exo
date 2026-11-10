# Review

Judge a change with the reviewer and rules `gate` uses, and change nothing.
Produce findings with `file:line` on changed lines only. Avoid a repair, a comment posted to a pull request, and a review of lines the target did not touch.

## When to use

- Reviewing uncommitted work, `base..head`, one commit, a branch or a pull request number, with no plan file.
- Not for a plan's branch (`gate`), a repair (`build`) or a pull request's review comments (`ship`).

## The loop

1. **Resolve the target.** Run `node "${CLAUDE_SKILL_DIR}/scripts/resolve-target.mjs" --root <checkout> [--target <argument>]`; no argument means uncommitted work.
   - `EMPTY` line → say nothing changed and end the turn.
   - A target that fails to resolve → end the turn with its error; guess no other target.
2. **Dispatch the reviewer.** Send `exo:review-branch` one message: `exo-kind: review-deep`, the `DISPATCH Review` fields, then `Read:` and the changed files read.
   - Add 3-5 questions from the diff's riskiest changes, because the input has no plan to draw them from.
3. **Print the findings.** Read the `findings=` file and print each finding whose range falls inside a `CHANGED` line, grouped by `Category:` and ordered by `Score:` per the reference. Count the rest as outside the change, and findings under score 4 or with no `Cite:` as hidden.
   - A missing file → resume once per the gate resume rule, then report `BLOCKED` with the path.
   - End with: repairs go through `build`; nothing was posted and no file in the checkout changed.

## Judgment

- A pull request comment is a side effect nobody can take back, so post none; `ship` owns comments.
