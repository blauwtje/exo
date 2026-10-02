# Architecture sketch

Read when an open decision names two or more structurally different shapes for new or changed behavior: a module boundary, a data model, an integration point.

- Pick a shape from a sketch, never from prose trade-offs alone.
- Sketch each candidate, never build it in full before choosing.

## Sketch, don't build

- Write each candidate's types, signatures and module boundaries.
- Leave bodies not-implemented, with pseudocode for the tricky parts.
- A reader traces data from input to output by reading the sketch alone.
- Two whole-shape candidates beat one shape refined twice.
- A second flavor of the same shape does not count as a candidate.

## Screen each candidate

Reject or revise a candidate that shows:

- **Shallow module.** A large interface hiding little; the caller learns the implementation anyway.
- **Information leakage.** A representation or protocol detail that appears in more than one module, so changing it means coordinated edits.
- **Temporal decomposition.** Modules split by execution order (load, validate, save) instead of by the knowledge they own.
- **Pass-through method.** A layer that forwards the same arguments onward without adding policy or adaptation.

## Pick on interface depth

- Prefer the candidate that hides more behind a smaller public surface, even when its implementation is harder, because callers then see less.
- Before recommending one, name what each surviving candidate hides.
- Name also what each still exposes to callers.

## The sketch is the contract

- The chosen sketch ships in the brief and is what the build implements.
- It is not a prototype to throw away; a throwaway answer to one open question is a different, single-candidate model owned elsewhere.
- Re-sketch only on a repeated pattern of friction during the build, never on one edge case.
- A repeated pattern is the same workaround shape recurring, a type needing an escape hatch to compile, an unplanned lock appearing, or a caller needing the abstraction's internals to use it.
- Fold the friction in as a constraint from the start of the next sketch, not bolted onto the old one.

## Judgment

- A repeated pattern of friction outranks a single edge case: one awkward call site does not condemn a shape that otherwise holds.
