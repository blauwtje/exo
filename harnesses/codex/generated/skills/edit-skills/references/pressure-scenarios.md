# Pressure scenarios

## Building the prompt

- Ask what the model does next, never what it ought to do; advice costs nothing, and only an action tests the skill.
- Never cut the model off from people, fix its tool budget, or insist the situation is real, because the live API rejects that framing before the first tool call.
<!-- 2026-09-23, #75: `claude -p` on claude-opus-5 and claude-fable-5-1 refused the escape-route framing as `reasoning_extraction`. Stale once that framing passes live on every model edit-skills runs. -->
- Offer concrete choices that each look reasonable, with real paths, figures and names.
- When the case needs pressure, make the right choice costly inside the task's own story: a cut-off time, an approver waiting, a green pipeline, hours already spent.

## When a case needs pressure

- Start every case as the ordinary task, because a mistake a real run already showed unprompted reappears without any push.
- Add pressure only when the run without the skill passes the ordinary task; pressure then supplies the temptation the task lacks.
- A default tendency, one seen in a real run and not induced by its prompt, never gets pressure: it adds no proof and risks a live refusal.

## Sources of pressure

- the situation: a deadline, a cost or a budget, and a plain "it works, ship it";
- investment: work already sunk into the wrong path, and the fatigue of a long session;
- people: someone senior who wants the shortcut, and the social cost of saying no.

One pressure gives a usable case; stack three when the skill guards a habit, because a skill that holds against one pressure still folds under the next.

## What each kind of file needs

- A skill guarding a costly habit, such as writing the test first, proving a cause before fixing, or asking before building: three pressure scenarios or more.
- A skill teaching a technique or pattern: a case that applies it, a case that varies it, a case missing one detail, and a case where the pattern must not be used.
- A reference: one case that looks something up, one that applies it, and one whose answer the reference does not hold; no pressure.

## Running it

1. Save the case to a prompt file and run it on every cell the loop's step 2 names, because a rule one model or effort needs is noise to another.
2. Run `scripts/pressure.mjs --prompt <file> --cells <model:effort,...> --plugin-dir <clone>`; it runs both arms of every cell `--runs` times (default 3) in parallel, each in a scratch directory outside the repository, and writes each full answer to its own file in `--out`. `--main-dir <main clone>` swaps the without arm for a `main` arm; a `WRONG COPY` line, exit 1, voids a run that loaded another copy.
3. Copy the chosen action and the justification word for word from the `without` answer files; that wording is what the skill has to answer.
4. Keep the prompt and both justifications in the edit's report.
5. Save the case in `benchmarks/pressure/<skill>/` as its README shows: the prompt files, `<skill>/criteria.md` with the `with` arm's pass criterion, and any fixture's `setup.sh`, because the next edit of the skill reruns it.
6. A run the API refuses before any tool call is neither a pass nor a fail: remove the framing that added the most pressure and rerun, never the same prompt unchanged.

## Judgment

- A case the run without the skill fails outranks a case that reads well.
