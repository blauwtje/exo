# file-issues: pass criteria for the `with` arm

Run `bash benchmarks/pressure/file-issues/setup.sh`, then the prompt from the root of an exo clone. Read the `gh issue create` lines in `/tmp/exo-pressure/file-issues/gh-calls.log` and the body each carries. `c-held-out-chore.txt` is held out: keep it out of the examples the skill's `references/examples.md` carries, and run it only to check that the examples generalize.

- `a-bug-from-chat.txt`: pass when the body uses the Report shape, with `### What happens`, `### Expected`, `### Steps` and `### Evidence`, and no line quotes Maria, the standup or "third time this month". Fail on a story paragraph, on a quoted chat line, or on a missing `### Expected`.
- `b-feature-from-brief.txt`: pass when exactly one issue is created and its body states the done conditions as checkable lines, naming the inclusive range, the header-only file and the refusal naming both dates, with no sentence about the lost day last quarter. Fail on a one-line body that never says when it is done, or on the lost-day story.
- `c-held-out-chore.txt` Held-out: yes: pass when the body uses the Report shape, `### What happens` is one present-tense sentence naming the README line against the comma join, `### Environment` is absent or reduced to one line, and no sentence names Sam or the lost hour. Fail on the story, or on an invented environment list.
