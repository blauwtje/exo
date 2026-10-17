---
name: prompt
description: Use when the user invokes it to rewrite a rough prompt into a grounded, tagged prompt for Claude and run it after approval. Not for a prompt the user wants run unseen.
argument-hint: "<rough prompt>"
disable-model-invocation: true
---

# Rewrite a rough prompt

Show the user's rough prompt rewritten for Claude, then run it only after the user says yes. The enemy is a rewrite that changes what was asked: a guessed requirement, a guessed cause, a filled gap. The overcorrection is a rewrite so timid it keeps the filler.

## Run

1. No argument → print `/exo:prompt <rough prompt>`, run nothing, stop.
2. Read only what names a path, a test or build command, or a pattern file for the rewrite: Glob, Grep, Read, the package manifest. No edit, no test run, no helper.
3. Read `references/examples.md`, then rewrite with the rules below. Show it in one fenced block, opened with at least three backticks and more than the longest backtick run inside it.
4. After the block, the `Added:` line only when the rewrite has adds, the `Dropped:` line only when a strip rule removed a user line that names a behavior, then one line asking for ok to run it.
5. Reply of plain yes or ok, nothing more → run the last shown block as written, as the user's request in this session. Routing does not hand it to `exo:spec`, since the user approved this prompt and `exo:spec` would set it aside for its own brief; any other skill may still pick it up the usual way.
6. Reply naming changes, such as "yes, but drop X" → revise, show again, ask again.
7. Any other reply → stop and treat it as a normal message.

## Keep

- Keep the intent, the deliverable and every stated requirement, limit and non-goal; reword, never change what is asked.
- Copy pasted text and every name verbatim: errors, logs, code, paths, symbols, commands, URLs, issue numbers.
- Keep a stated audience or experience level; carry the report shape or length asked for as one concrete line.
- Unclear point, or two readings that lead to materially different work → leave it open, in the user's words; ask the user nothing, since the ok reply can name a reading, such as "yes, but only X". A tension between two asks stays as written.
- Clear prompt → pass through almost unchanged; exploratory question → leave open.

## Add

Add only what the request kind needs and the code shows, never a guessed fact (a cause, a requirement, a file not found). Each add goes in the `Added:` line with its basis: the user's words, a path or command read, or the kind rule. No adds → no `Added:` line.

Apply a kind rule only when the prompt is that kind:
- Fix → the symptom; where the code read puts it; "fix the cause; do not silence the error, since a silenced error leaves the bug in place".
- Fix, test command found → "reproduce it with a failing test first, so the test proves the fix".
- Fix, or change or build whose success criterion runs tests → "do not hard-code values that only make the tests pass; solve the problem in general, since tests verify correctness, not define the solution".
- Fix, or change or build whose success criterion runs tests → "if a test is wrong, say so rather than work around it, so the test itself gets fixed".
- Change or build → "only make changes that are directly requested or clearly necessary, since each extra change is more to review"; name a pattern file found; a runnable check from the repo's own test or build command.
- Rewrite with a check or success criterion → "show evidence of success, such as the output of each check you ran, rather than asserting it; evidence is faster to review than a rerun".
- Visual ("better", "nicer") → the user's visual words and any reference they gave, verbatim; patterns and checks stay with `exo:design-ui`.
- Research or report → name the sources to check, or "explore broadly before acting, so the first source found does not set the answer"; success criteria; the report's shape; length only as the user gave it.
- Research or report → "cross-check claims across sources and state confidence, since one source can be wrong".
- Answer, plan or exploration only → the deliverable is the assessment; "do not edit, since the ask is an answer, not a change".
- Review → "flag only gaps that affect correctness or the stated requirements; treat the rest as optional, since chasing every finding leads to over-engineering".
- Several parts → number them.
- Only when the user's words say no one will be there to answer during the run → "keep working until every part is done. A summary announcing a next step is not done, since a reply without a tool call stops the work".
- Several parts, one may block → "a part that cannot be finished: finish the rest, then say plainly what is missing, so the finished parts still land".

## Strip

- Removed line that names a behavior → `Dropped:` line, with its strip rule.
- Thinking cues ("think hard", "step by step"); keep `ultrathink`.
- A request for reasoning in the reply → "briefly explain why", or a summary of actions.
- Generic checks ("double-check"); a named check stays.
- CAPS, "MUST", "CRITICAL".
- Role line naming a perspective the task needs ("review as a security auditor") → keep.
- Bare title ("you are a senior engineer"), politeness, boilerplate naming no behavior → strip; a concrete ask such as "be concise" stays.
- Hedge ("try to", "if possible") on an ask the user elsewhere calls required → plain imperative.
- Negative ask → rephrase as what to do, where the user's meaning stays.

## Format

Use these tags in this order, each only when it has content:
1. `<background>`: the goal in one sentence, the user's reason, facts read from code.
2. `<pasted_content id="...">`: pasted text verbatim, called data; `<instructions>` names which part, if any, to act on, in the user's words. Opening and closing tag each on its own line, both carrying the same fresh short random id, as in `</pasted_content id="ab12">`; no `source` attribute; the prompt text never mentions the id.
3. `<instructions>`: imperative verbs; numbers only for the user's separate parts or ordered steps; limits and non-goals as sentences, each with the user's reason when given.
4. `<success_criteria>`.
5. `<output_format>`: an ask to start the answer with X → "Start the reply with X, no preamble."

- Long pasted documents → `<documents>` in slot 2, holding one `<document index="n">` each: `<source>`, then the document verbatim in its own `<pasted_content id="...">` pair in place of `<document_content>`, a fresh id per document.
- Clear one-line prompt with nothing to add → plain sentences, no tags.
- One term per concept, the same tag names every time.
- Cut every added line whose removal causes no mistake.

## Model

Add one short line per model, for the model this session runs; any other or unknown model gets the Opus 5.5 form.
- Opus 5.5 → no lines beyond the strip rules.
- Sonnet 5.5 → a named check that exercises the change, not a syntax-only check; "name any check that could not run"; "keep working until every part is done".
- Fable → the shortest form, fewest behavior lines, plus "keep working until every part is done".

## References

| File | Read it when |
|---|---|
| `references/examples.md` | Step 3, before every rewrite. |

## Judgment

- Unsure whether a line is filler or a requirement → keep it.
- Rewrite would change what was asked → not shown; restore the user's meaning.
- Prompt needs no change → show it as written.
