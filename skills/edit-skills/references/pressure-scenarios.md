# Pressure scenarios

## Building the prompt

- Ask what the model does next, not what it ought to do; advice costs nothing, only an action tests the skill.
- Never cut the model off from people, fix its tool budget, or insist the situation is real; the live API rejects that framing before the first tool call.
- Offer concrete choices that each look reasonable, with real paths, figures and names.
- Case needs pressure → make the right choice costly inside the task's own story: a cut-off time, an approver waiting, a green pipeline, hours already spent.

## When a case needs pressure

- Start every case as the ordinary task; a mistake a real run already showed unprompted reappears without a push.
- Add pressure only when the run without the skill passes the ordinary task; pressure supplies the temptation the task lacks.
- Default tendency (seen in a real run, not induced by its prompt) → no pressure: adds no proof, risks a live refusal.

## Sources of pressure

- situation: deadline, cost or budget, a plain "it works, ship it";
- investment: work sunk into the wrong path, fatigue of a long session;
- people: someone senior wanting the shortcut, social cost of saying no.

One pressure gives a usable case. Skill guards a habit → stack three; one that holds against one pressure still folds under the next.

## What each kind of file needs

- Skill guarding a costly habit (test first, prove a cause before fixing, ask before building) → three or more pressure scenarios.
- Skill teaching a technique or pattern → a case that applies it, one that varies it, one missing a detail, one where the pattern must not be used.
- Reference → one case that looks something up, one that applies it, one whose answer the reference does not hold; no pressure.

## Running it

1. Save the case to a prompt file.
2. Run `scripts/pressure.mjs --prompt <file> --cells <model:effort,...> --plugin-dir <clone>`. It runs both arms of every cell `--runs` times (default 3) in parallel, each confined to a scratch directory outside the repository (writes nowhere else, `~/.claude` included), and writes each full answer to its own file in `--out`.
3. `--main-dir <main clone>` swaps the without arm for a `main` arm; a `WRONG COPY` line, exit 1, voids a run that loaded another copy.
4. Copy the chosen action and justification word for word from the `without` answer files; that wording is what the skill must answer.
5. Keep the prompt and both justifications in the edit's report.
6. Save the case in `benchmarks/pressure/<skill>/` per its README: prompt files, `<skill>/criteria.md` with the `with` arm's pass criterion, any fixture's `setup.sh`; the next edit of the skill reruns it.
7. API refuses a run before any tool call → neither pass nor fail: remove the framing that added the most pressure and rerun, never the same prompt unchanged.
