# Options

Use this when the user asks for options or ideas. One context drafting every option drafts near its first idea, so the steps below force distance.

## Draw the pairs

- Run step 2's repo map once, and two or three `gh search repos` queries for projects that solve the same problem plus one from a far domain. Read their descriptions for ideas and copy nothing.
- Run the `draw-seats.mjs` command the skill body gives once; it prints 3 pairs, each a seat and a forbidden move. Keep them as printed and never redraw.

## Draft one option per pair

- Draft one option per pair, in printed order, from that seat; a design that uses the forbidden move fails.
- Each option opens with its core mechanism and `p=`, your estimate that a typical engineer proposes that mechanism first. No two options share a core mechanism.
- At most 10 lines: a title, the mechanism in two sentences about what the user sees, types, signatures and module boundaries (no bodies), and what it hides from callers.

## Replace the likely

- An option with p above 0.15: redraft once from the same pair with a less likely mechanism, until at least 2 options sit at p at most 0.15.

## Screen each candidate

Revise or drop an option with a large interface that hides little, a detail that two modules must change together, modules split by execution order instead of the knowledge they own, or a layer that only forwards its arguments.

## Show and pick

- Show the 2-3 most distinct survivors, each beside its seat; when one matches a project found above, add a line saying it already exists, with its URL.
- Score each per 3-5 criteria from the request, interface depth weighted highest. Prefer the option that hides more behind a smaller surface.
- When parts of two options hold under one data model, graft them and name each source. Recommend one, with its reason.

## Stop at the options

- Then ask the user to pick one and stop: write no brief, run no plan-check, dispatch no agent. Each signature of the picked sketch becomes the `Data:` of the task that builds it.
