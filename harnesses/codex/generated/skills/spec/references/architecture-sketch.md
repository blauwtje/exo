# Architecture sketch

Read when an open decision names two or more structurally different shapes for new or changed behavior: a module boundary, a data model, an integration point. The enemy is picking a shape from prose trade-offs alone. The overcorrection is building each candidate in full before choosing.

## Sketch, don't build

- Write each candidate's types, signatures and module boundaries.
- Bodies not-implemented; pseudocode for the tricky parts.
- Reader traces data from input to output by the sketch alone.
- Two whole-shape candidates beat one shape refined twice; a second flavor of the same shape is not a candidate.

## Screen each candidate

Reject or revise a candidate showing:

- **Shallow module.** Large interface hiding little; caller learns the implementation anyway.
- **Information leakage.** Representation or protocol detail in more than one module; changing it needs coordinated edits.
- **Temporal decomposition.** Modules split by execution order (load, validate, save), not by the knowledge they own.
- **Pass-through method.** Layer forwarding the same arguments without adding policy or adaptation.

## Pick on interface depth

- Prefer the candidate hiding more behind a smaller public surface, even with a harder implementation.
- Before recommending → name what each surviving candidate hides and what it still exposes to callers.

## The sketch is the contract

- Chosen sketch ships in the brief; the build implements it.
- Not a throwaway prototype; a throwaway answer to one open question is a different, single-candidate model owned elsewhere.
- Re-sketch only on a repeated pattern of friction during the build, never on one edge case.
- Repeated pattern = same workaround shape recurring, a type needing an escape hatch to compile, an unplanned lock appearing, or a caller needing the abstraction's internals.
- Fold the friction in as a constraint from the start of the next sketch, not bolted onto the old one.

## Judgment

- One awkward call site does not condemn a shape that otherwise holds.
