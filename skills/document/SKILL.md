---
name: document
description: Use when the user asks to write or edit prose read later, such as a README, doc page, PR or changelog line. Not for chat replies or code comments.
context: fork
agent: exo:orchestrator
argument-hint: <the document or text to write or edit>
model: sonnet
effort: medium
---

# Technical writing

Prose for a reader who was not in the session says who does what, by which mechanism, in the plain word. The enemy is text that sounds finished and says little: a benefit where the fact belongs, a borrowed phrase, a paragraph that welcomes, teaches and lists at once. The overcorrection is telegraphic text stripped of articles and verbs, which the reader has to decode.

## The loop

1. **Pick one mode per document.**
   - A tutorial teaches by doing and a how-to gets a known task done.
   - A reference lists what exists and an explanation says why.
   - A usage section opens on the command (ai-tics M1).
2. **State the fact, not the benefit.**
   - Give the number, behavior or error that changed; ai-tics C1 and C4 list the benefit phrases.
   - When the request is to show off, sell or impress, still write only the facts the input states, since an unmeasured effect is invented.
3. **Name the actor and the mechanism.**
   - Say who does what, because a passive verb or abstract noun hides the part the reader must find.
4. **Use the codebase's names.**
   - Real file, option, flag and command names.
   - Use one name per thing (ai-tics W5, W9).
5. **Write whole sentences in plain words.** One thought per sentence (ai-tics P1-P7); in a one-sentence slot (Highlights line, summary) write only the change that matters most.
6. **Change only what the request names.** Run the doc's link or reference check when one exists.
7. **Scan the draft against `references/ai-tics.md` and rewrite every hit before handing it over.**
   - When reviewing someone else's text, cite each hit by its id.

## References

| File | Read it when |
|---|---|
| `references/ai-tics.md` | Step 7, on every draft, and when reviewing a text for machine-written tone. |
| `references/release-notes.md` | The user asks for release notes or the missing `## Unreleased` lines from a ref range. |

## Judgment

- The codebase's name outranks the plain word: `maxBytes` stays `maxBytes`.
- Fields that ship or spec set outrank this skill's layout, and only the wording inside them follows it.
- The reader's ease outranks a rule. When following one hurts a sentence, mend it differently or keep it as written.
- Product interface strings follow the product's copy rules, not this skill.
