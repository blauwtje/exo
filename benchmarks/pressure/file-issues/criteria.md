# file-issues: pass criteria for the `with` arm

Run `bash benchmarks/pressure/file-issues/setup.sh`, then the prompt from the root of an exo clone. Read the `gh issue create` lines in `/tmp/exo-pressure/file-issues/gh-calls.log` and the body each carries. `c-held-out-chore.txt` is held out: keep it out of the examples the skill's `references/examples.md` carries, and run it only to check that the examples generalize.

## a-unreproduced-bug.txt

- The body uses the Report shape, with `### What happens` and `### Expected`. `grade: run grep -q "### What happens" gh-calls.log && grep -q "### Expected" gh-calls.log`
- `### Steps` is absent or holds only a line saying no reproduction is known yet, and no body line names who reported the bug, such as "Reported by Finance" or "Finance reports". A label under `### Evidence` that names who supplied the quoted item, such as "The row Finance sent:", passes; the fail applies to every other line naming the reporter. `grade: judge`

## b-feature-from-brief.txt

- Exactly one issue is created. `grade: run test "$(grep -c '^--- body ---' gh-calls.log)" = 1`
- The body states the done conditions as checkable lines, naming the inclusive range, the header-only file and the refusal naming both dates, and is not a one-line body that never says when it is done. `grade: judge`
- No sentence in the body tells the lost day last quarter. `grade: judge`

## c-held-out-chore.txt

Held-out: yes.

- The body uses the Report shape, `### What happens` is one present-tense sentence naming the README line against the comma join, and `### Steps` is not required. `grade: judge`
- `### Environment` is absent or reduced to one line, with no invented environment list. `grade: judge`
- No sentence names Sam or the lost hour. `grade: run ! grep -qwiE "Sam|lost" gh-calls.log`
