# Architecture sketch

This page gives the user options to pick from before any work starts. Read it when asked for options or when two or more structurally different shapes compete: a module boundary, a data model, an integration point. The enemy is one context drafting every option near the first, and the overcorrection is building each in full before choosing.

## Draw the pairs

- Before drafting any option, run step 4's repo map once yourself.
- Then run `node "${CLAUDE_SKILL_DIR}/scripts/draw-seats.mjs"` once, which prints 3 pairs, each a seat and a forbidden move.
- Keep the pairs as printed: swap none for one you prefer, and never redraw.

## Draft one option per pair

- Draft in your own context, one option per pair, in printed order.
- Read the code the map names before designing; the design fits the code there.
- Design from the seat; a design that uses the forbidden move fails.
- Each option opens with `Core mechanism:` and `p=`.
- Set p to your estimate of the chance that a typical engineer, given this request and no prompting, proposes that mechanism first.
- An option may not reuse an earlier option's core mechanism. When it does, redraft it from its pair.
- Write types, signatures and module boundaries, not bodies.
- Keep each option to 10 lines: a title, the mechanism in two sentences about what the user sees and does, the sketch, and what it hides and exposes to callers.

## Replace the likely

- An option with p above 0.15 → redraft once from the same pair with a mechanism of lower p, until at least 2 options sit at p at most 0.15.
- A redraft still meets the seat, the forbidden move and the request.

## Screen each candidate

Reject or revise a candidate showing:

- **Shallow module.** Large interface hiding little; caller learns the implementation anyway.
- **Information leakage.** Representation or protocol detail in more than one module; changing it needs coordinated edits.
- **Temporal decomposition.** Modules split by execution order (load, validate, save), not by the knowledge they own.
- **Pass-through method.** Layer forwarding the same arguments without adding policy or adaptation.

## Show and pick

- Show the 2-3 most distinct survivors, each beside its seat; a second flavor of one shape is not an option.
- Score each option per 3-5 criteria from the request, interface depth weighted highest, not on overall feel.
- Prefer the option that hides more behind a smaller public surface, even when its implementation is harder.
- When parts of two options hold under one data model, graft them and name each source.
- Recommend one, with its reason.

## Stop at the options

- After Show and pick, ask the user to pick one and stop. Write no spec file, run no plan-check and dispatch no agent.
- Read at most 3 files beyond the map.

## The sketch is the contract

- Chosen sketch ships in the brief; the build implements it.
- Re-sketch only on a repeated pattern of friction during the build, not on one awkward call site.
