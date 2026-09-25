---
name: blast-radius
description: "Use when asked to merge or ship a diff if safe, what a change could break, or to build on a claim that existing code handles X or nothing uses Y. Not for reported failures (debug), explaining code (investigation), plan conformance (branch-reviewer) or one-function edits."
argument-hint: <the diff, branch or claim to check>
---

# Blast radius

Before a change lands, find what it breaks outside its diff and prove the fact its safety rests on by running the real code. The enemy is the caller list plus "looks safe": a writeup that reads well, was never executed, and is trusted because CI is green. The overcorrection is a long list of maybes nobody weighed, or a proof harness for an edit whose effect stays inside one function.

## When to use

- A diff about to merge or ship whose effect can reach code, data or processes it does not touch: a renamed field, a new side effect, a changed return or timing.
- A request asking what a change could break, or a diff the user does not trust.
- A brief, plan or request asserting that existing code already handles something or that nothing depends on something, before a design builds on it.
- Not for a failure already observed: `debug` owns it.
- Not for how or why code works with no decision riding on it: `investigation` owns it.
- Not for checking a finished plan branch against its plan: the branch-reviewer agents `implementing` dispatches own it.
- Not for choosing what to restructure (`deepen`) or pinning a named refactor's behavior (`refactoring`).

## The loop

1. **State what now behaves differently.** Include what the diff does not spell out: what the functions it newly calls do, the shape it now writes, the order or timing it moves.
2. **Name the one fact it is safe because of.** One sentence, such as "prune only drops entries every reader already treats as missing"; most risk stands or falls with it. A comment, README, commit message or colleague asserting that fact is the claim, not its proof.
3. **Look where symbol search stops.** Follow callbacks and hooks the changed code now fires, fields read through a built key or string, another process or language reading the same bytes or rows, flags, and code three hops downstream. Read a library at the version the lockfile pins, in its installed source, since its README can describe another version.
4. **Run the real code.** Write a throwaway script outside the repository that imports the actual module or pinned library, drives the path in question, and fails loud; paste the command and its output. Reproduce in the running app when that is cheap.
5. **Tag every safety claim with its level, even in a three-line reply.** `[1 asserted]`, `[2 file:line]`, `[3 traced]`, `[4 ran]` or `[5 live]` follows each claim, because the reader cannot tell a proven "safe" from a guessed one. A claim below 4 is reported at its level, never as "safe".
6. **Fan out a wide change.** When consumers span several areas, give each area to its own read-only delegate, all dispatched in parallel, each returning its risks with their ladder level, and merge the answers yourself.
7. **Hand back before acting on it.** Write the result in the shape of `references/hand-back.md`; a proven break stops the merge or the design, and the user decides with the proof in hand.

## Red flags

| The excuse | What holds |
|---|---|
| "CI is green and it was approved." | The suite tests the diff's own code; breakage outside it runs in no test the diff touched. |
| "The comment, README or standup says it is handled." | That is level 1; the installed code at the pinned version decides. |
| "Grep finds no other caller." | Grep misses built keys, callbacks, other languages and readers of the same data; name what was searched. |
| "No time for a script before the deadline." | One script calling the real function takes minutes; report the fact as unproven rather than safe. |

## References

| File | Read it when |
|---|---|
| `references/hand-back.md` | Step 7, before writing the result. |

## Judgment

- A fact run against the real code outranks any amount of reading.
- An unproven fact is reported unproven, never rounded up to safe, whatever the deadline.
- Stop climbing the ladder once the next level costs more than the change's worst case, and say so.
- Confirmed risks and checked-and-cleared ones stay in separate lists, because a mixed list hides which one blocks.
