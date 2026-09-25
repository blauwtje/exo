---
name: write-docs
description: "Use when writing or editing prose read later: a README or doc page, a PR, issue or commit body, a changelog line, a brief or spec. Not for chat replies (the output style), code comments (the code standard), or fields ship, file-issues and define-scope set."
argument-hint: <the document or text to write or edit>
---

# Technical writing

Prose for a reader who was not in the session says who does what, by which mechanism, in the plain word. The enemy is text that sounds finished and says little: a benefit where the fact belongs, a borrowed phrase, a paragraph that welcomes, teaches and lists at once. The overcorrection is telegraphic text stripped of articles and verbs, which the reader has to decode.

## When to use

- Writing or editing a README, doc page, ADR, pull request body, issue body, commit body, changelog line, brief or spec.
- Reviewing such a text because it reads as machine-written.
- Not for the shape of a pull request, issue, commit subject or brief: ship, file-issues and define-scope set the fields, and this skill words the text inside them.
- Not for chat replies: the output style owns them.
- Not for code comments: the code standard owns them.
- Not for product interface strings: the product's copy rules own them.

## The loop

1. **Pick one mode per document.** A tutorial teaches by doing, a how-to gets a known task done, a reference lists what exists, an explanation says why. A Usage section is a how-to or a reference, so it opens on the command, never on a welcome, because a reader who came for a flag skips the tour.
2. **State the fact, not the benefit.** Give the number, the behavior or the error that changed, because "ensuring stability" or "more robust" asks the reader to trust what the text could have shown. A request to show off, sell or impress still gets only the facts the input states, because an effect nobody measured is invented.
3. **Name the actor and the mechanism.** Write "`boot.ts` reads `CACHE_MAX_BYTES`", not "the limit is now configurable", because a passive verb or an abstract noun hides the part the reader has to find.
4. **Use the codebase's names.** The real file, option, flag and command, one name per thing, because a synonym reads as a second thing.
5. **Write whole sentences in plain words.** Keep the articles and verbs, spell out "about" and "and", and prefer the period to the dash or semicolon. One thought per sentence, split past 25 words. A one-sentence slot, such as a Highlights line or a summary, holds the change that matters most, because two joined with "and" bury both.
6. **Scan the draft against `references/ai-tics.md` before handing it over.** Rewrite every hit and keep the meaning; a review of someone else's text cites each hit by its id.

## References

| File | Read it when |
|---|---|
| `references/ai-tics.md` | Step 6, on every draft, and when reviewing a text for machine-written tone. |

## Judgment

- The fields ship, file-issues or define-scope set outrank this skill's layout; only the wording inside them follows it.
- The codebase's name outranks the plain word: `maxBytes` stays `maxBytes`.
- A reader's ease outranks a rule: when a rule makes a sentence worse, fix the sentence another way or leave it.
- Clarity outranks brevity: an article or verb whose loss makes the reader decode stays.
