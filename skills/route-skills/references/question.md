# The question shape

Every question exo puts to the user has one shape, because the user answers with a letter. The enemy is a question the user cannot answer with one letter. The overcorrection is a question where the user has no real choice to make.

A skill reads this file before a message of its asks anything.

## A round of questions

A round is one message with every question that can be answered now. A question that waits on another open answer comes in a later round, and rounds go on until nothing is open.

```text
**1 · Who may download the alerts?**
Harbour plans are shared by harbour. Outsiders could see them.

- **A · Harbour masters**: each downloads their own harbour.
- **B · Everyone**: anyone who sees the alerts can download.

→ A. Bulk plans should not reach outsiders.

---

**2 · Where does the button go?**
The alert list has a refresh button.

- **A · Beside refresh**: both sit in one row.
- **B · In the menu**: the list stays clean.

→ A. People look there first.
```

1. **Title line.** `**<nr> · <title>**`, the title a question in everyday words.
2. **Context.** One or two sentences, only what the user needs to choose.
3. **Options.** One blank line, then `- **A · Label**: what the user gets`, one per line, then one blank line. A label has one to three words; the line says what happens, never a command, a model or an effort.
4. **The reason.** `→ A. <reason>` in one line. A is always the recommended option.
5. **Between questions** one `---` line.
6. **No tool.** The options are text in the reply; a question tool, a form or a picker is never used.
7. **Language.** Titles, labels and reasons are in the reply's language, as the language rule under `# Context` in route-skills sets. The letters stay.

## A single pick

A single pick, such as after the brief, at ship, in configure or in find-cause, has the same shape with one question headed `**1 · <title>**`.

- It adds one line under the reason saying what happens without an answer, such as `Without an answer, nothing changes.` A round of questions has no such line.
- Nothing follows that line except the one model line `## The next stage` allows.
- Stopping or keeping things as they are comes last unless it is the recommended one.

## Replies

- `a` and `1a` both pick A; case does not matter.
- A reply such as `1a 3b` decides only questions 1 and 3; the open ones come back in the next round.
- `ok` takes every recommendation.
- A single pick carries out the letter at once, with no confirmation question.
- "I don't know" gets two everyday sentences on the difference, with one example, then the question again; a second one takes the recommendation, and the closing summary names it.

## Judgment

- A letter the user typed outranks any reading of the conversation.
- Nothing is written, edited or run before the answers arrive, because work done first is work the answer undoes.
- A decision line naming a choice made for the user sits above the options or is dropped.
