---
name: investigation
description: "Use when asked how X works, to explain or confirm what code does, why it is so, if a stated reason holds, even as a PR verdict, or for it in a runbook, ADR or doc. Not for locations (exo:explorer), external libraries (research), unproven failures (debug) or restructuring (deepen)."
argument-hint: <how, why or teach, and the code in question>
---

# Investigation

Explain this repository from what was read in it this session, and say how sure each claim is. The enemy is the fluent answer built from a name, a comment, the asker's own theory or memory, which the user then acts on. The overcorrection is an answer so hedged or so long it decides nothing, or a list of locations where a narrative was asked.

## When to use

- `how`: how something works, a walkthrough before a change, where a value really comes from.
- `why`: why code is shaped this way, whether a stated reason holds, whether something can go.
- `teach`: how plus why, pitched at the asker's level.
- The skill changes no file; a change the answer leads to goes to the stage that owns it.
- Not for locations only: the `exo:explorer` agent returns those.
- Not for how an external library or API behaves: `research` owns it.
- Not for behavior reported wrong with an unproven cause: `debug` owns it.
- Not for where the architecture should change: `deepen` owns it.

## The loop

1. **Name the mode and the question.** Write the question in one sentence and pick `how`, `why` or `teach`; a theory the asker brings is a hypothesis to test, never a finding.
2. **Read before you claim.** Every claim about behavior rests on a file and line opened this session, because a name, a comment or a recalled pattern can say the opposite of the code.
3. **Trace the whole chain.** Follow the path from entry to effect, including config, environment and call-site overrides, since the value that runs is often not the default at the definition.
4. **Dig the history for `why`.** Follow `references/history.md` back to the commit that introduced the value, past later moves and tidy-ups, because code and its comments show what, never why.
5. **Tier every claim.** Mark each claim verified, inferred or unknown per `references/confidence.md`; a request for plain words changes the wording, never the tier. A lead's or asker's certainty is their claim, never "confirmed", because it is not a source the repository holds.
6. **Answer in its shape.** Open with the direct answer, then follow `references/answer-shapes.md`: a narrative for `how`, evidence by tier for `why`, layers for `teach`.
7. **Hand back.** When the answer bears on a pending change, state the constraint the evidence found and leave the change to its owner.

Discovery that spans many files goes to the `exo:explorer` agent for locations; the ranges it returns are then read here, because a location is not an explanation.

## Red flags

| The excuse | What holds |
|---|---|
| "The name says what it does." | A name is a claim; the body decides, and `exponentialBackoff` can be linear. |
| "The comment explains why." | A comment can be added years later by someone else; the commit that set the value is the evidence. |
| "Blame already shows the commit." | Blame shows the last move of the line; trace back to the commit that set the value. |
| "The asker already knows the reason." | Their theory is the hypothesis step 1 tests, not a source. |
| "Confirmed by the tech lead." | A person's certainty is a hypothesis; with no commit, PR or issue behind it, the reason stays inferred or unknown. |
| "They want it plain, no caveats." | Plain words, same tier; an inference stated as fact is what the user acts on. |
| "A list of files answers how." | Locations are `exo:explorer`'s job; `how` asks for the chain in prose. |

## References

| File | Read it when |
|---|---|
| `references/history.md` | Step 4, before the first `why` claim. |
| `references/confidence.md` | Step 5, when a claim's tier or its wording is unclear. |
| `references/answer-shapes.md` | Step 6, before writing the answer. |

## Judgment

- Evidence read this session outranks a name, a comment, memory and the asker's theory.
- For `why`, the commit that set a value outranks the code and later commits; for `how`, the running code outranks history.
- An honest unknown with what was searched outranks a confident guess, even when a definitive line is demanded.
- A short answer that opens with the direct answer outranks a complete report.
