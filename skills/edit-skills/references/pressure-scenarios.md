# Pressure scenarios

A pressure scenario tempts the model into the mistake the skill guards against, so a run shows whether the skill stops it.

## Building the prompt

- Ask what the model does next, because advice costs nothing and only an action tests the skill.
- Keep the model connected to people, leave its tool budget alone and do not insist the situation is real. The live API rejects that framing before the first tool call.
- Offer concrete choices that each look reasonable, with real paths, figures and names.
- When a case needs pressure, make the right choice costly inside the task's own story: a cut-off time, an approver waiting, a green pipeline, hours already spent.

## When a case needs pressure

- Start every case as the ordinary task, because a mistake seen in a real run reappears without a push.
- Add pressure only when the run without the skill passes the ordinary task, because pressure supplies the temptation the task lacks.
- Add no pressure for a default tendency seen in a real run, since it proves nothing and risks a refusal.

## Sources of pressure

- Situation: a deadline, cost or budget, or a plain "it works, ship it".
- Investment: work sunk into the wrong path, or the fatigue of a long session.
- People: someone senior wanting the shortcut, or the social cost of saying no.

One pressure gives a usable case. For a skill that guards a habit, stack three, because a skill that holds against one pressure still folds under the next.

## What each kind of file needs

- A skill guarding a costly habit (test first, prove a cause before fixing, ask before building) needs pressure scenarios for it.
- A skill teaching a technique or pattern needs a case that applies it, one that varies it, one missing a detail and one where the pattern must not be used.
- A reference needs one case that looks something up, one that applies it and one whose answer the reference does not hold, all without pressure.

## Running it

1. Save the case to a prompt file.
2. When the user asks for a run, or no stored answers cover the case, run `scripts/pressure.mjs --prompt <file> --cells <model:effort,...> --plugin-dir <clone>`. It runs both arms of every cell `--runs` times (default 1; `--full` for more) in parallel, each in a scratch directory outside the repository (it writes nowhere else, `~/.claude` included), and writes each full answer to a file in `--out`.
3. To compare against `main`, add `--main-dir <main clone>`, which swaps the without arm for a `main` arm. A `WRONG COPY` line with exit 1 voids a run that loaded another copy.
4. Copy the chosen action and justification word for word from the `without` answers, because the skill must answer that wording.
5. Keep the prompt and both justifications in the report.
6. Save the case in `benchmarks/pressure/<skill>/` per its README: prompt files, `<skill>/criteria.md` with the `with` arm's pass criterion, and any fixture's `setup.sh`. The next edit of the skill reruns it.
7. When the API refuses a run before any tool call, count it as neither pass nor fail, drop the framing that added the most pressure and rerun with a changed prompt.
