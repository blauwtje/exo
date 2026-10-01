# The question shape

Every question exo puts to the user has one shape, because the user answers with one letter. The enemy is a question too long, too technical or too many at once to answer with one letter. The overcorrection is a question where the user has no real choice to make.

A skill reads this file before a message of its asks anything.

## One question

A message asks one question, never several, because the user then answers with one letter and nothing else. After the answer, the next question comes only if one is still open.

```text
**How should we pick the new look?**
I have three looks ready. You can see them first or let me choose.

- **(A) Show me**: open all three side by side in your browser.
- **(B) Describe them**: I explain each look here in a few words.
- **(C) You choose**: I build the calmest one.

Recommended: (A), because seeing the looks beats reading about them, and (C) skips your say.
```

1. **Title line.** `**<title>**`, a plain everyday question of at most about ten words; no number, no `---` line.
2. **Context.** At most two short sentences, only what the user needs to choose. Plain words anyone understands: no token counts, seconds, costs, tool, model or effort names, no file name the user need not open, and no internal name unless the user picks between them.
3. **Options.** One blank line, then `- **(A) Label**: what the user gets`, one per line, then one blank line. A label has one to three words; the text says in one short plain clause what the user gets or gives up, enough to choose without asking back, and never holds a command.
4. **Three or four options.** Two only when no honest third route exists; a padded option is a fake choice.
5. **Recommendation.** `Recommended: (A), because <why A beats the others>`, one plain clause on one line. A is always the recommended option.
6. **Size.** Under about 60 words outside the option labels, because simple beats complete; nothing follows the recommendation.
7. **No tool.** The options are text in the reply; a question tool, a form or a picker is never used.
8. **Language.** Title, context, labels and recommendation are in the reply's language, as the language rule in route-skills' `references/context.md` sets. The letters stay.
9. **Order.** Stopping or keeping things as they are comes last unless it is the recommended one.

## Replies

- `b`, `B` and `(b)` all pick B, carried out at once with no confirmation question.
- `ok` takes the recommendation.
- "I don't know" gets two everyday sentences on how the options differ, with one example, then the same question again; a second one takes the recommendation, and the closing summary names it.

## Judgment

- A letter the user typed outranks any reading of the conversation.
- Nothing is written, edited or run before the answer arrives, because work done first is work the answer undoes.
- A decision line naming a choice made for the user counts as one of the two context sentences, or is dropped.
