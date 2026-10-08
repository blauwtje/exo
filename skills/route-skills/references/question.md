# The question shape

## One question

A message asks one question by default, so the user answers with one letter. Several decisions open at once, none waiting on another's answer → one message asks them all, numbered, each in this shape, one letter each. Otherwise next question only after the answer, if one is still open.

```text
**How should we pick the new look?**
I have three looks ready. You can see them first or let me choose.

- **(A) Show me**: open all three side by side in your browser.
- **(B) Describe them**: I explain each look here in a few words.
- **(C) You choose**: I build the calmest one.

Recommended: (A), because seeing the looks beats reading about them, and (C) skips your say.
```

1. **Title line.** `**<title>**`, plain everyday question, at most about ten words; no number outside a batch, no `---` line.
2. **Context.** At most two short sentences, only what the user needs to choose. Plain words anyone understands: no token counts, seconds, costs, tool, model or effort names, no file name the user need not open, no internal name unless the user picks between them.
3. **Options.** One blank line, then `- **(A) Label**: what the user gets`, one per line, then one blank line. Label: one to three words; text: one short plain clause on what the user gets or gives up, enough to choose without asking back; never holds a command.
4. **Three or four options.** Two only when no honest third route exists; a padded option is a fake choice.
5. **Recommendation.** `Recommended: (A), because <why A beats the others>`, one plain clause on one line. A is always the recommended option.
6. **Size.** Under about 60 words outside the option labels; simple beats complete. Nothing follows the recommendation.
7. **No tool.** Options are text in the reply; a question tool, a form or a picker is never used, except design-ui's scope form.
8. **Language.** Title, context, labels and recommendation go in the reply's language, as the language rule in route-skills' `references/context.md` sets. Letters stay.
9. **Order.** Stopping or keeping things as they are comes last unless it is the recommended one.

## Replies

- `b`, `B` and `(b)` all pick B → carry it out at once, no confirmation question.
- `ok` → take the recommendation.
- "I don't know" → two everyday sentences on how the options differ, with one example, then the same question again; a second one → take the recommendation, and the closing summary names it.

## Judgment

- Write, edit or run nothing before the answer arrives; work done first is work the answer undoes.
- A letter the user typed outranks any reading of the conversation.
- A decision line naming a choice made for the user counts as one of the two context sentences, or is dropped.
