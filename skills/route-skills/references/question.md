# The question shape

## When to ask

Ask only when the answer is a preference or product outcome only the user knows and a wrong guess is costly to undo. A question that cannot be phrased in everyday words about what the user sees or gets is exo's to decide: decide it, and record it where the skill says. Default is zero questions.

A choice with a safe default is no question: take it and list it under `**Decided for you**` at the end of the reply, as `hooks/session-rules.md` sets. Still ask an irreversible step, a choice with no safe default, and a choice only the user's account or eyes can settle.

## One question

A message asks exactly one question, so the user answers with one letter. Several decisions open → the one whose answer matters most comes first; the next comes only after the answer, if one is still open. Each question has this shape.

```text
**How should we pick the new look?**
You can see three looks first or let me choose.

- **(A) Show me**: all three sketches open in your browser.
- **(B) Describe them**: I explain each look here.
- **(C) You choose**: I build the calmest one.

Recommended: (A), because seeing beats reading about them.
```

1. **Title line.** `**<title>**`, plain everyday question ending in `?`, at most 10 words; no `---` line, no number.
2. **Context.** At most one sentence of at most 15 words, only when the user needs it to choose. Plain words anyone understands: no token counts, seconds, costs, tool, model or effort names, no file name the user need not open, no internal name unless the user picks between them.
3. **Options.** One blank line, then `- **(A) Label**: what the user gets`, one per line, then one blank line. Label: one to three words; text: at most 8 words on what the user gets or gives up; never holds a command.
4. **Two or three options.** Two only when no honest third route exists; a padded option is a fake choice.
5. **Recommendation.** `Recommended: (<letter>), because <why that option beats the others>`, naming any shown letter, reason at most 8 words, one line. Options keep their order and letters, whoever recommends.
6. **Size.** Simple beats complete. Nothing follows the recommendation.
7. **No tool.** Options are text in the reply; a question tool, a form or a picker is never used.
8. **Language.** Title, context, labels, the word `Recommended` and the recommendation go in the reply's language, as the language rule in route-skills' `references/context.md` sets. Letters stay.
9. **Order.** Stopping or keeping things as they are comes last, unless the menu is a configure menu, where the current value stays A.

## Replies

- `b`, `B` and `(b)` all pick B → carry it out at once, no confirmation question.
- `ok` → take the recommendation and carry it out at once, like a letter: no recap, no confirmation question.
- A picked option approves every step it names, including an outward write it states (opening an issue, posting a comment) → no second question for it; only an irreversible step the option did not name gets a new question.
- "I don't know" → two everyday sentences on how the options differ, with one example, then the same question again; a second one → take the recommendation, and the closing summary names it.

## Judgment

- Write, edit or run nothing before the answer arrives; work done first is work the answer undoes.
- A letter the user typed outranks any reading of the conversation.
- A decision line naming a choice made for the user counts as the one context sentence, or is dropped.
