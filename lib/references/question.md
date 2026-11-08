# The question shape

## When to ask

Ask only when the answer is a preference or product outcome only the user knows and a wrong guess is costly to undo. A question that cannot be put in everyday words about what the user sees or gets is exo's to decide and record where the skill says. Default is zero questions.

A choice with a safe default is no question: take it and list it under `**Decided for you**` (reply language) at the end of the reply, one `because <criterion>` clause per line, as the session rules set. Still ask an irreversible step, a choice with no safe default, and a choice only the user's account or eyes can settle.

## One question

One question per message, answered with one letter. Several decisions open → the most important first; the next only after the answer. Each question has this shape.

```text
**How should we pick the new look?**
You can see three looks first or let me choose.

- **(A) Show me**: all three sketches open in your browser.
- **(B) Describe them**: I explain each look here.
- **(C) You choose**: I build the calmest one.

Recommended: (A), because seeing beats reading about them.
```

1. **Title line.** `**<title>**`, plain question ending in `?`, at most 10 words; no `---` line, no number.
2. **Context.** At most one sentence of at most 15 words, only when the user needs it to choose. Plain words: no token counts, seconds, costs, tool, model or effort names, no file name the user need not open, no internal name unless the user picks between them.
3. **Options.** One blank line, then `- **(A) Label**: what the user gets`, one per line, then one blank line. Label: one to three words, and text of at most 8 words on what the user gets or gives up, no command.
4. **Two or three options.** Two only when no honest third route exists.
5. **Recommendation.** Check every option against the request's or repo's criteria, then recommend the winner: `Recommended: (<letter>), because <why that option beats the others>`, reason at most 8 words, one line. Options keep their order and letters.
6. **Size.** Nothing follows the recommendation.
7. **No tool.** Options are text in the reply; never a question tool, form or picker.
8. **Language.** Title, context, labels, `Recommended` and the reason use the user's language. Letters stay.
9. **Order.** Stopping or keeping things as they are comes last, except in a configure menu, where the current value stays A.

## Replies

- `b`, `B` and `(b)` all pick B → carry it out at once, no confirmation.
- `ok` → take the recommendation like a letter: no recap, no confirmation.
- A picked option approves every step it names, including an outward write it states (opening an issue, posting a comment) → no second question; only an irreversible step the option did not name gets one.
- "I don't know" → two everyday sentences on how the options differ, with one example, then ask again; a second one → take the recommendation and name it in the closing summary.

## Judgment

- Write, edit or run nothing before the answer arrives.
- A letter the user typed outranks any reading of the conversation.
- A decision line naming a choice made for the user counts as the context sentence.
