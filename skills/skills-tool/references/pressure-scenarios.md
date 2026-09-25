# Pressure scenarios

A skill is proven by the prompt that most tempts the model to ignore it. The enemy is the quiz-style prompt, which the run without the skill passes by quoting the rule back and so proves nothing. The overcorrection is a setup so artificial the model solves it as a riddle rather than doing the work.

## What each kind of file needs

- A skill guarding a costly habit, such as writing the test first, proving a cause before fixing, or asking before building: three pressure scenarios or more.
- A skill teaching a technique or pattern: a case that applies it, a case that varies it, a case missing one detail, and a case where the pattern must not be used.
- A reference: one case that looks something up, one that applies it, and one whose answer the reference does not hold; no pressure.

## When a case needs pressure

- Start every case as the ordinary task, because a mistake a real run already showed unprompted reappears without any push.
- Add pressure only when the run without the skill passes the ordinary task; pressure then supplies the temptation the task lacks.
- A default tendency, one seen in a real run and not induced by its prompt, never gets pressure: it adds no proof and risks a live refusal.

## Sources of pressure

Pressure comes from the situation, from the model's own investment, and from the people involved:

- the situation: a deadline, a cost or a budget, and a plain "it works, ship it";
- investment: work already sunk into the wrong path, and the fatigue of a long session;
- people: someone senior who wants the shortcut, and the social cost of saying no.

One pressure gives a usable case; stack three for a strong one, because a skill that holds against one pressure still folds under the next.

## Building the prompt

- Offer concrete choices that each look reasonable, with real paths, figures and names.
- When the case needs pressure, make the right choice costly inside the task's own story: a cut-off time, an approver waiting, a green pipeline, hours already spent.
- Ask what the model does next, never what it ought to do; advice costs nothing, and only an action tests the skill.
- Never cut the model off from people, fix its tool budget, or insist the situation is real, because the live API rejects that framing before the first tool call.
<!-- 2026-09-23, #75: `claude -p` on claude-opus-5 and claude-fable-5-1 refused the escape-route framing as `reasoning_extraction`. Stale once that framing passes live on every model skills-tool runs. -->

## Running it

1. Save the case to a prompt file, then take the model and effort from the next-stage model table of `using-exo` for a stage skill, from the frontmatter for an agent with the session's effort where it names none, `sonnet` at `high` for a build delegate's prompt, and the session's own for any other skill; a rule one model or effort needs is noise to another.
2. Run `scripts/pressure.mjs --prompt <file> --cells <model:effort,...> --plugin-dir <clone>`; it runs the without-skill and with-skill arm of every cell `--runs` times (default 3) in parallel, each in a scratch directory outside the repository. It writes every full final answer to its own file in the `--out` directory (default a fresh temporary directory, named on the first line), and prints per cell its label, then one line per arm and run: the answer file, the first Edit or Write action, and every skill the run called.
3. Copy the chosen action and the justification word for word from the `without` answer files; that wording is what the skill has to answer.
4. Read the `with` answer files for the same cell; they count as a pass only when the `without` answers failed.
5. Keep the prompt and both justifications in the edit's report, and save the case in `benchmarks/pressure/<skill>/`, because the next edit of the skill reruns it.
   It holds the prompt files, `<skill>/criteria.md` with the `with` arm's pass criterion, and any fixture's `setup.sh`, rerun as the README in `benchmarks/pressure/` shows.
6. A run the API refuses before any tool call is neither a pass nor a fail: remove the framing that added the most pressure and rerun, never the same prompt unchanged.

## Judgment

- A case the run without the skill fails outranks a case that reads well.
- The ordinary task outranks a pressured one when both make the run without the skill fail.
- Stacked pressures outrank a single one when the skill guards a habit.
- Action outranks advice: a prompt the model answers with "one should" is rewritten until it has to act.
