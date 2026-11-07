---
name: prompt
description: Use when the user asks to rewrite a rough prompt into a grounded one and run it. Not for a prompt the user wants run unseen.
disable-model-invocation: true
argument-hint: "<rough prompt>"
---

# Rewrite a rough prompt

Goal: the user gets a prompt that says what they asked, grounded in the code, and runs it only after a yes. The enemy is a rewrite that changes what was asked: a guessed requirement, a guessed cause, a filled gap. The overcorrection is a rewrite so timid it keeps the filler or repeats what the session already does.

## Run

1. With no argument, print `/exo:prompt <rough prompt>`, run nothing and stop.
2. Read only what names a path, a test or build command, or a pattern file, such as the package manifest. Make no edit, run no test and write no helper.
3. Read `references/examples.md`, then rewrite with the rules below. Show it in one fenced block, opened with more backticks than the longest run inside it, at least three.
4. After the block comes the note (`references/note.md`, read first).
   - For an in-session prompt, the reply line and exactly the line `Ok to run it?` follow.
   - For a prompt meant elsewhere, nothing follows.
5. A reply of plain yes or ok, nothing more, runs the last shown block as written, as the user's request in this session. A prompt meant elsewhere runs nothing.
   - Do not route it through `exo:spec`, which would swap it for its own brief; other skills may pick it up.
6. A reply naming changes, such as "yes, but drop X", changes only what X names and shows the block again. The note then holds only new suggestions that change raises.
   - A reply such as `1a`, `1a 2b` or `2: <value>` applies only those items and shows the block again.
7. Any other reply ends the skill; treat it as a normal message.

## Covered

An instruction the target session loads already covers a line. Those instructions are the harness system prompt, CLAUDE.md files, rules, memory, output style, session hook text and skill descriptions. A hook, test, script or check the repo runs, as read in step 2, covers a line too.

- Leave out a covered line the rewrite would add, such as a kind rule or a model line. Judge each line on its own: a kind rule fires by request kind, even when a related line, such as a check the session runs, was left out.
- Strip a user line that only restates a covered line, since the session does it anyway. Keep one that narrows, strengthens or adds a detail.
- When unsure whether a line is covered, keep it.
- A prompt meant elsewhere is covered only by what that target loads. A new session in the same repo loads the same CLAUDE.md files, rules and memory, not this conversation, and another tool or model loads none.

## Keep

A rewrite that drops a requirement changes the ask, so these stay.

- Keep the intent, the deliverable and every stated requirement, limit and non-goal, except a line `## Covered` strips. Reword it, but do not change what is asked.
- When the rough prompt asks for a prompt to use elsewhere, such as in a new session, the block is that prompt, not a prompt asking for it.
- Copy verbatim only errors, logs, code, a source document (`## Format`), a chat message to answer, and every name: paths, symbols, commands, URLs, issue numbers, config keys.
- Reduce other pasted text, such as a screen, a state description or the rest of a chat, to the facts the task uses, as short `<background>` lines, not a copy.
- Keep a stated audience or experience level, and carry the report shape or length asked for as one concrete line.
- Leave an unclear point, or two readings that lead to materially different work, open in the user's words, and ask the user nothing. A tension between two asks stays as written.
- When an ask clashes with a well-known fixed fact of the system it names, write one `<background>` open point: "Check first:" and the fact, then the ask in the user's words, so the session verifies it before acting. Resolve nothing and pick no side.
- When an ask writes outside the repo, add one `<instructions>` grant per system it writes to, where results land too (app form, secret store), stating which write and how far in the user's words. Grant only the reach the user stated, with no "Check first:" ask, and make reach left unsaid an open point.
- Pass a clear prompt through almost unchanged and leave an exploratory question open.

## Add

Add only what the request kind needs and the code shows. Do not add a guessed fact, such as a cause, a requirement or a file not found.

Apply a kind rule only when the prompt is that kind:
- Fix, change, build, rewrite with a check, or visual -> read `references/kinds-edit.md`.
- Research, report, answer, plan, exploration or review -> read `references/kinds-report.md`.
- Several parts: number them.
- Only when the user's words say no one will be there to answer during the run, add "keep working until every part is done. A summary announcing a next step is not done, since a reply without a tool call stops the work".
- Long, looping or open-ended job: add "stop after 5 rounds of change and check, or sooner when a round makes no progress; then report what is left".
- Outside project, library or tool named only by name: add "first find its official repository or docs and name the link you used".
- Vague goal with no measurable done test: add "first turn the goal, in the user's words, into concrete checks and list them; done is each check holding".
- Several parts where one may block: add "a part that cannot be finished: finish the rest, then say plainly what is missing, so the finished parts still land".

## Strip

- Thinking cues ("think hard", "step by step"). Keep the one word joining `ultra` and `think`.
- A request for reasoning in the reply; use "briefly explain why", or a summary of actions.
- Generic checks ("double-check"). A named check stays.
- CAPS, "MUST" and "CRITICAL".
- Keep a role line naming a perspective the task needs ("review as a security auditor").
- Strip a bare title ("you are a senior engineer"), politeness and boilerplate that names no behavior. A concrete ask such as "be concise" stays.
- Turn a hedge ("try to", "if possible") on an ask the user elsewhere calls required into a plain imperative.
- Rephrase a negative ask as what to do, where the user's meaning stays.

## Format

Use these tags, each only when it has content, and put context and data before the ask:
1. `<background>`: the goal in one sentence, the user's reason, facts read from code or kept from pasted text, an open point.
2. `<pasted_content id="...">`: only the pasted text `## Keep` copies verbatim, called data.
   - `<instructions>` names which part, if any, to act on, in the user's words.
   - Put the opening and closing tag each on its own line, both carrying the same fresh short random id, or the id the rough prompt already gives, as in `</pasted_content id="ab12">`.
   - Add no `source` attribute and leave the id out of the prompt text.
3. `<instructions>`: numbers only for the user's separate parts or ordered steps; limits and non-goals as sentences, each with the user's reason when given.
4. `<success_criteria>`.
5. `<output_format>`: an ask to start the answer with X becomes "Start the reply with X, no preamble."

- For a long pasted source document, such as a spec, use `<documents>` where `<pasted_content>` would go. It holds one `<document index="n">` each: `<source>`, then the document verbatim in its own `<pasted_content id="...">` pair in place of `<document_content>`.
- A clear one-line prompt with nothing to add stays plain sentences, no tags.
- Cut every added line whose removal causes no mistake.

## Model

Add lines for the model this session runs. For another or unknown model, use the Opus 5.5 form, in `references/model.md`. Add the keep-working line only per its `## Add` rule, for every model.

## References

| File | Read it when |
|---|---|
| `references/examples.md` | Step 3, before every rewrite. |
| `references/note.md` | Step 4, before the note. |
| `references/kinds-edit.md` | The request is a fix, change, build, rewrite with a check or visual. |
| `references/kinds-report.md` | The request is research, a report, an answer, a plan, an exploration or a review. |
| `references/model.md` | Before adding a model line. |

## Judgment

- When unsure whether a line is filler or a requirement, keep it.
- Given your own earlier output with its suggestions applied, show the same block with no note. Do not swap synonyms or reorder to look different.
