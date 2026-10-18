# Architecture sketch

Read when asked for options, or when two or more structurally different shapes compete: a module boundary, a data model, an integration point. The enemy is one context drafting every option, so each lands near the first. The overcorrection is building each in full before choosing.

## Dispatch the seats

- Before drafting any option yourself → run step 4's repo map once.
- Then dispatch 3 `general-purpose` agents in one message, foreground, one per row below.
- Each agent's prompt → `## Seat prompt` with `[[request]]`, `[[map]]`, `[[seat]]` and `[[forbidden]]` filled from its row.
- A seat prompt holds no candidate of yours and no other seat's reply.

| Seat | Forbidden move |
|---|---|
| **Smallest interface.** One to three entry points. | The platform default, or the shape the code already has. |
| **Commonest caller.** Its call reads as one line. | Keeping the current data model. |
| **Most flexible.** A new use case needs no interface change. | Adding a server, service or background job. |

## Seat prompt

Design one way to build the request below in the repository at your working directory. Load no skill, edit no file, ask nothing.

Request: [[request]]

Repo map:
[[map]]

Seat: [[seat]] Draw the design from this constraint.
Forbidden: [[forbidden]] A design that uses it fails.

- Read the code the map names before designing; the design fits the code there.
- Write types, signatures and module boundaries; bodies left out.
- Reply in at most 20 lines: a title; the mechanism in two sentences, what the user sees and does; the sketch; what it hides and what it still exposes to callers.

## Screen each candidate

Reject or revise a candidate showing:

- **Shallow module.** Large interface hiding little; caller learns the implementation anyway.
- **Information leakage.** Representation or protocol detail in more than one module; changing it needs coordinated edits.
- **Temporal decomposition.** Modules split by execution order (load, validate, save), not by the knowledge they own.
- **Pass-through method.** Layer forwarding the same arguments without adding policy or adaptation.

Then name the shape every reply shares, such as the same store, split or entry point; one shared by all → dispatch one seat again with that shape added to its forbidden move, once.

## Show and pick

- Show the 2-3 most distinct survivors, each beside its seat; a second flavor of one shape is not an option.
- Score each option per 3-5 criteria from the request, interface depth one, not on overall feel.
- Interface depth → prefer the option hiding more behind a smaller public surface, even with a harder implementation.
- Parts of two options hold under one data model → graft them; name each source.
- Recommend one, with its reason.

## The sketch is the contract

- Chosen sketch ships in the brief; the build implements it.
- Re-sketch only on a repeated pattern of friction during the build, never on one awkward call site.
