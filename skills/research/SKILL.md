---
name: research
description: Use when a code decision hinges on how a pinned external library, framework, API or service behaves and a wrong recalled answer would still compile or type-check yet fail at runtime or at the provider boundary. Not for questions the repository's own code answers, a version bump alone, or a concept explanation.
effort: high
---

# Research

Confirm external behavior against the current source instead of recalling it.
The enemy is the version-specific detail recalled with confidence, wrong in the way that compiles and fails at runtime.
The overcorrection is researching a call the repository already makes elsewhere: working code outranks a fresh fetch.

## When to use

- A code decision depends on how a pinned external version behaves, and a wrong answer would still compile or type-check.
- Not for a question the repository's own code answers, a version-only bump, or a concept with no version dependency.

## The loop

1. **Find the installed version** in the lockfile or manifest first, because the question is how this pinned version behaves, not how the library works.
2. **Fetch that version's first-party docs**, changelog or migration guide, never a blog post; without an exact match use the highest documented version not newer than the install, else the lowest newer one, and state both versions.
3. **Fetch only the section that answers the question** and quote at most ten lines, because a page read once is re-read every later turn.
4. **Cite every claim that shaped a decision** with its URL; an uncited claim is a recollection and is flagged as one.
5. **State what could not be confirmed** instead of filling the gap: "could not confirm X; proceeding on Y" is a valid outcome.

## Where this runs

- Delegate the read to a `general-purpose` delegate on `sonnet` from `researcher-prompt.md` with the pinned version, the exact question and a stop condition; the same prompt owns a document on disk, and `scout-prompt.md` owns the repository.
- Read here only when no separate context exists, one page at a time.
- Hand back the confirmed facts, their citations and the unconfirmed remainder, never the pages.

## Output

Findings stay in the message.
Write `docs/research/<library>.md` only when the user asks for a file, or a named later executor needs the findings and they rest on two or more first-party sources.

## Red flags

| Thought | Reality |
|---|---|
| "I know this API." | Knowing the concept is not knowing this version; read the lockfile. |
| "The latest docs will do." | The install is older; the answer diverges across minor versions. |
| "I'll paste the page for context." | Ten quoted lines and a URL; the page costs every later turn. |

## References

| File | Read it when |
|---|---|
| `researcher-prompt.md` | Before every documentation or document dispatch. |
| `scout-prompt.md` | Before a codebase discovery dispatch, here or from any skill that links it. |

## Judgment

- For what deployed code does today, the repository's working code outranks fetched docs; for code written or upgraded now, the pinned or target version's docs outrank a pattern the source marks deprecated or unsafe, and unrelated code is not modernized.
- Never end a turn on a research pass alone. It unblocks a `shaping`, `planning`, `implementing-batch` or `debug` step in progress, unless the user asked a standalone question with no code to follow.
- After a compaction notice, restate the facts from the delegated report or the research file, or repeat the delegated read; recollection is not research.
