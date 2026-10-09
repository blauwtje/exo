---
name: check-docs
description: Use when a code decision hinges on how a pinned external library, framework, API or service behaves, and a wrong recalled answer would compile yet fail at runtime. Not for what the repository's code answers, a version bump, or a concept explanation.
disable-model-invocation: true
argument-hint: <library, version and question>
effort: high
---

# Research

Confirm external behavior against current source, not recall.
The enemy is the version-specific detail recalled with confidence, wrong in a way that compiles and fails at runtime.
The overcorrection is researching a call the repository already makes in deployed code: for what that code does today, working code outranks a fresh fetch.

## When to use

- Code decision depends on how a pinned external version behaves, and a wrong answer would still compile or type-check.
- Not for a question the repository's own code answers, a version-only bump, or a concept with no version dependency.

## The loop

1. **Find the installed version** in lockfile or manifest first; question is how this pinned version behaves, not how the library works.
2. **Fetch that version's first-party docs**, changelog or migration guide, never a blog post; no exact match → highest documented version not newer than the install, else lowest newer one; state both versions.
3. **Fetch only the section that answers the question**, quote at most ten lines; a page read once is re-read every later turn.
4. **Cite every claim that shaped a decision** with its URL; uncited claim = recollection, flagged as one.
5. **State what could not be confirmed**, never fill the gap: "could not confirm X; proceeding on Y" is a valid outcome.

## Where this runs

- Dispatch the `exo:fetch-docs` agent with the question alone: library, pinned version and what to confirm, or the document paths.
- The agent holds budget, stop rule and report shape; dispatch repeats none. `exo:locate-code` owns the repository.
- No separate context → read here, one page at a time.
- Hand back confirmed facts, citations and the unconfirmed remainder, never pages.

## Output

Findings stay in the message; turn ends under the closing rule in `route-skills`: confirmed answer first, citations next, then what stayed unconfirmed.
Write `docs/research/<library>.md` only when the user asks for a file, or a named later executor needs the findings and they rest on two or more first-party sources.

## Red flags

| The excuse | What holds |
|---|---|
| "I know this API." | Knowing the concept is not knowing this version; read the lockfile. |
| "The latest docs will do." | Install is older; answer diverges across minor versions. |
| "I'll paste the page for context." | Ten quoted lines and a URL; the page costs every later turn. |

## Judgment

- What deployed code does today → repository's working code outranks fetched docs. Code written or upgraded now → pinned or target version's docs outrank a pattern the source marks deprecated or unsafe; unrelated code is not modernized.
- Never end a turn on a research pass alone. Pass unblocks a `spec`, `build` or `find-cause` step in progress → hand findings back, step continues; standalone question with no code to follow → turn ends on the findings, per Output.
- After a compaction notice → restate facts from the delegated report or research file, or repeat the delegated read; recollection is not research.
