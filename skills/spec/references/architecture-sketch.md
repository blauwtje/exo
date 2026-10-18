# Architecture sketch

Read when an open decision names two or more structurally different shapes for new or changed behavior: a module boundary, a data model, an integration point. The enemy is picking a shape from prose trade-offs alone. The overcorrection is building each candidate in full before choosing.

## Set criteria first

- Before sketching → write 3-5 criteria from the brief; interface depth is one.

## Sketch, don't build

- Write each candidate's types, signatures and module boundaries.
- Bodies not-implemented; pseudocode for the tricky parts.
- Reader traces data from input to output by the sketch alone.
- Two whole-shape candidates beat one shape refined twice; a second flavor of the same shape is not a candidate.

## Draw candidates apart

- Each candidate → a different constraint, named beside it, from this list or the brief:
  - **Smallest interface.** One to three entry points.
  - **Commonest caller.** Its call reads as one line.
  - **Most flexible.** A new use case needs no interface change.
- Drafts done → name the shape every candidate shares, such as the same store, split or entry point; one shared by all → redo one candidate with that shape banned.

## Screen each candidate

Reject or revise a candidate showing:

- **Shallow module.** Large interface hiding little; caller learns the implementation anyway.
- **Information leakage.** Representation or protocol detail in more than one module; changing it needs coordinated edits.
- **Temporal decomposition.** Modules split by execution order (load, validate, save), not by the knowledge they own.
- **Pass-through method.** Layer forwarding the same arguments without adding policy or adaptation.

## Pick per criterion

- Score each candidate per criterion, not on overall feel.
- Interface depth → prefer the candidate hiding more behind a smaller public surface, even with a harder implementation.
- Parts of two candidates hold under one data model → graft them; name each source.
- Before recommending → name what each surviving candidate hides and what it still exposes to callers.

## The sketch is the contract

- Chosen sketch ships in the brief; the build implements it.
- Sketch is not a prototype; question only running code answers → throwaway script, answer into `## Decisions`, script deleted.
- Re-sketch only on a repeated pattern of friction during the build, never on one edge case.
- Repeated pattern = same workaround shape recurring, a type needing an escape hatch to compile, an unplanned lock appearing, or a caller needing the abstraction's internals.
- Fold the friction in as a constraint from the start of the next sketch, not bolted onto the old one.

## Judgment

- One awkward call site does not condemn a shape that otherwise holds.
