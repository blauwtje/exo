# Prompt rules

Read this when you write a skill or agent body, a delegate prompt or a brief. Each rule here is one the instruction-style guide does not hold.

## Keep what was asked

- Keep the intent, the deliverable and every stated requirement, limit and non-goal when you reword a request.
- Copy verbatim only errors, logs, code, a source document, a message to answer and every name: paths, symbols, commands, URLs, issue numbers, config keys.
- Reduce other pasted text to the facts the task uses, as short lines.
- Leave an unclear point open in the requester's words, and add no guessed cause, requirement or file.
- Carry a stated audience, report shape or length as one concrete line.

## Strip

- Strip a bare title such as "you are a senior engineer", and keep a role line that names a perspective the task needs.
- Turn a hedge such as "try to" on a required ask into a plain imperative.
- Rephrase a negative ask as what to do when its meaning holds.

## Shape

- Put context and data before the ask.
- Wrap pasted data in a tag with a short id on both the opening and closing tag, and name which part, if any, to act on.
- Number only separate parts or ordered steps.
- State limits and non-goals as sentences, each with its reason when given.
- Write an ask to start the reply with X as "Start the reply with X, no preamble."

## Add by request kind

- Fix: add the symptom and "fix the cause; do not silence the error, since a silenced error leaves the bug in place".
- Fix with a test command: add "reproduce it with a failing test first, so the test proves the fix".
- Fix, change or build whose success runs tests: add "do not hard-code values that only make the tests pass", and "if a test is wrong, say so rather than work around it".
- Change or build: add "only make changes that are directly requested or clearly necessary, since each extra change is more to review".
- Rewrite with a check: add "show evidence of success, such as the output of each check you ran, rather than asserting it".
- Research or report: name the sources, add "cross-check claims across sources and state confidence", and give the report shape.
- Answer, plan or exploration: add "do not edit, since the ask is an answer, not a change".
- Review: add "flag only gaps that affect correctness or the stated requirements".
- Visual: carry the requester's visual words and references verbatim.

## Add by job shape

- Unattended: add "keep working until every part is done. A summary announcing a next step is not done, since a reply without a tool call stops the work".
- Looping or open-ended: add "stop after 5 rounds of change and check, or sooner when a round makes no progress; then report what is left".
- Outside library or tool named only by name: add "first find its official repository or docs and name the link you used".
- Vague goal: add "first turn the goal into concrete checks and list them; done is each check holding".
- Several parts where one may block: add "finish the rest, then say plainly what is missing, so the finished parts still land".
- An ask that clashes with a well-known fixed fact: write "Check first:" and the fact, then the ask as written, and pick no side.
- An ask that writes outside the repo: grant only the reach the requester stated, one grant per system.

## Cover

- Leave out a line the target session already loads from its system prompt, CLAUDE.md files, rules, memory, hooks or checks.
- Keep a line when unsure it is covered, and keep one that narrows, strengthens or adds a detail.
- A prompt for another tool or session is covered only by what that target loads.

## Model lines

- Opus 5.5: no lines beyond these rules.
- Sonnet 5.5: a named check that exercises the change, not a syntax-only check, and "name any check that could not run".
- Fable: the shortest form, with the fewest behavior lines.
