---
name: write-docs
description: "Use when writing or editing prose read later: a README, doc page, PR, issue or commit body, changelog line, brief or spec. Not for chat replies (output style), code comments (code standard), or fields ship, file-issues and spec set."
argument-hint: <the document or text to write or edit>
---

# Technical writing

Prose for a reader who was not in the session says who does what, by which mechanism, in the plain word. The enemy is text that sounds finished and says little: a benefit where the fact belongs, a borrowed phrase, a paragraph that welcomes, teaches and lists at once. The overcorrection is telegraphic text stripped of articles and verbs, which the reader has to decode.

## The loop

1. **Pick one mode per document.**
   - Tutorial teaches by doing; how-to gets a known task done; reference lists what exists; explanation says why.
   - Usage section opens on the command, never on a welcome.
2. **State the fact, not the benefit.**
   - Give the number, behavior or error that changed; "ensuring stability" or "more robust" asks for trust the text could have earned.
   - Request to show off, sell or impress → still only the facts the input states; an unmeasured effect is invented.
3. **Name the actor and the mechanism.**
   - Say who does what; a passive verb or abstract noun hides the part the reader must find.
4. **Use the codebase's names.**
   - Real file, option, flag and command names.
   - One name per thing; a synonym reads as a second thing.
5. **Write whole sentences in plain words.**
   - Keep articles and verbs.
   - Prefer the period to the dash or semicolon.
   - One thought per sentence; split past 25 words.
   - One-sentence slot (Highlights line, summary) → only the change that matters most; two joined with "and" bury both.
6. **Scan the draft against `references/ai-tics.md` and rewrite every hit before handing it over.**
   - Reviewing someone else's text → cite each hit by its id.

## References

| File | Read it when |
|---|---|
| `references/ai-tics.md` | Step 6, on every draft, and when reviewing a text for machine-written tone. |

## Judgment

- Codebase's name outranks the plain word: `maxBytes` stays `maxBytes`.
- Fields ship, file-issues or spec set outrank this skill's layout; only the wording inside them follows it.
- Reader's ease outranks a rule: following one hurts a sentence → mend it differently or keep it as written.
- Product interface strings follow the product's copy rules, not this skill.
