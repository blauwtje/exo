---
name: prompt
description: Use when the user invokes it to rewrite a rough prompt into a grounded, tagged prompt for Claude and run it after approval. Not for a prompt the user wants run unseen.
argument-hint: "<rough prompt>"
disable-model-invocation: true
---

# Rewrite a rough prompt

Rewrite the rough prompt; run it only after a yes. The enemy is a rewrite that changes what was asked: a guessed requirement, a guessed cause, a filled gap. The overcorrection is a rewrite so timid it keeps the filler or repeats what the session already does.

## Run

1. No argument → print `/exo:prompt <rough prompt>`, run nothing, stop.
2. Read only what names a path, a test or build command, or a pattern file, such as the package manifest. No edit, no test run, no helper.
3. Read `references/examples.md`, then rewrite with the rules below. Show it in one fenced block, opened with more backticks than the longest run inside it, at least three.
4. After the block, the note (`## Note`); in-session prompt → then exactly the line `Ok to run it?`; prompt for elsewhere → nothing more.
5. Reply of plain yes or ok, nothing more → run the last shown block as written, as the user's request in this session; prompt for elsewhere → run nothing. Not via `exo:spec`, which would swap it for its own brief; other skills may pick it up.
6. Reply naming changes, such as "yes, but drop X" → change only what X names, show again; the note holds only new suggestions that change raises.
7. Any other reply → stop and treat it as a normal message.

## Covered

- Covered line → said by an instruction the target session loads: harness system prompt, CLAUDE.md files, rules, memory, output style, session hook text, skill descriptions. Also covered: enforced by a hook, test, script or check the repo runs, as read in step 2.
- Covered line the rewrite would add (kind rule, model line) → leave it out. Each line is judged on its own: a kind rule fires by request kind, even when a related line, such as a check the session runs, was left out.
- User's line that only restates a covered line → strip, since the session does it anyway; one that narrows, strengthens or adds a detail → keep.
- Unsure whether covered → keep.
- Prompt for elsewhere → covered only by what that target loads: a new session in the same repo loads the same CLAUDE.md files, rules and memory, not this conversation; another tool or model loads none.

## Keep

- Keep the intent, the deliverable and every stated requirement, limit and non-goal, except a line `## Covered` strips; reword, never change what is asked.
- Rough prompt asks for a prompt to use elsewhere, such as in a new session → the block is that prompt, not a prompt asking for it.
- Copy verbatim only errors, logs, code, a source document (`## Format`), a chat message to answer, and every name: paths, symbols, commands, URLs, issue numbers, config keys.
- Other pasted text, such as a screen, a state description or the rest of a chat → only the facts the task uses, as short `<background>` lines, not a copy.
- Keep a stated audience or experience level; carry the report shape or length asked for as one concrete line.
- Unclear point, or two readings that lead to materially different work → leave it open, in the user's words; ask the user nothing. A tension between two asks stays as written.
- Ask clashes with a well-known fixed fact of the system it names → one `<background>` open point: "Check first:" and the fact, then the ask in the user's words, so the session verifies it before acting. Resolve nothing, pick no side.
- Ask writes outside the repo → one `<instructions>` grant per system it writes to, where results land too (app form, secret store): which write, how far, in the user's words. Grant only the reach the user stated, never a "Check first:" ask; reach left unsaid → open point.
- Clear prompt → pass through almost unchanged; exploratory question → leave open.

## Add

Add only what the request kind needs and the code shows, never a guessed fact (a cause, a requirement, a file not found).

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

- Thinking cues ("think hard", "step by step"); keep the one word joining `ultra` and `think`.
- A request for reasoning in the reply → "briefly explain why", or a summary of actions.
- Generic checks ("double-check"); a named check stays.
- CAPS, "MUST", "CRITICAL".
- Role line naming a perspective the task needs ("review as a security auditor") → keep.
- Bare title ("you are a senior engineer"), politeness, boilerplate naming no behavior → strip; a concrete ask such as "be concise" stays.
- Hedge ("try to", "if possible") on an ask the user elsewhere calls required → plain imperative.
- Negative ask → rephrase as what to do, where the user's meaning stays.

## Note

0-3 lines `Suggest: <one change> (<few-word reason>).`, phrased so the user can reply "yes, but <change>"; most material first.

- Admit one only when the user alone can supply it and it could change the work materially; kinds, each one that fires:
  - Long, looping, paid or open-ended job → each absent item. Items: money cap for paid runs, measurable done test for a vague goal, stop rule (max rounds or budget), links for outside projects named only by name, how big a change may be (improve, remove, rewrite).
  - User names a skill whose own description rules out the task → keep the skill in the prompt; quote that clause.
  - Two readings leading to materially different work → name both.
  - Path, file, symbol or skill the user names as existing and step 2 did not find → suggest checking the name; not for one the prompt asks to create.
- Suggested item → never a value in the block; the reply supplies it.
- Not a suggestion: a report of what the rewrite added or dropped, wording polish, anything the block answers, one shown for this prompt earlier in the conversation.
- None admitted → no note; silence is the default.

## Format

Use these tags, each only when it has content; put context and data before the ask:
1. `<background>`: the goal in one sentence, the user's reason, facts read from code or kept from pasted text, an open point.
2. `<pasted_content id="...">`: only the pasted text `## Keep` copies verbatim, called data; `<instructions>` names which part, if any, to act on, in the user's words. Opening and closing tag each on its own line, both carrying the same fresh short random id, or the id the rough prompt already gives, as in `</pasted_content id="ab12">`; no `source` attribute; the prompt text never mentions the id.
3. `<instructions>`: numbers only for the user's separate parts or ordered steps; limits and non-goals as sentences, each with the user's reason when given.
4. `<success_criteria>`.
5. `<output_format>`: an ask to start the answer with X → "Start the reply with X, no preamble."

- Long pasted source document, such as a spec → `<documents>` where `<pasted_content>` would go, holding one `<document index="n">` each: `<source>`, then the document verbatim in its own `<pasted_content id="...">` pair in place of `<document_content>`.
- Clear one-line prompt with nothing to add → plain sentences, no tags.
- Cut every added line whose removal causes no mistake.

## Model

Lines for the model this session runs; other or unknown model → the Opus 5.5 form. Keep-working line → only per its `## Add` rule, for every model.
- Opus 5.5 → no lines beyond the strip rules.
- Sonnet 5.5 → a named check that exercises the change, not a syntax-only check; "name any check that could not run".
- Fable → the shortest form, fewest behavior lines.

## References

| File | Read it when |
|---|---|
| `references/examples.md` | Step 3, before every rewrite. |

## Judgment

- Unsure whether a line is filler or a requirement → keep it.
- Own earlier output with its suggestions applied → same block, no note; no synonym swap or reorder to look different.
