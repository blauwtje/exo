---
name: prototyping
description: "Use when a logic or data-flow decision needs running code first: a state model, an algorithm, an untried integration, a prototype, throwaway or proof of concept, or the urge to build it for real to find out. Not for a decided change, which implementing-batch builds, or a look, which designing owns."
argument-hint: <the open question to try>
---

# Prototyping

Answer one open question with code built to be deleted, and keep the answer. The enemy is the experiment that becomes the implementation because something real started calling it. The overcorrection is an experiment built so carefully that the question is still open when it is finished.

## When to use

- A decision waits on running code: a state model, an algorithm, a data flow, or an integration nobody has tried.
- The request says prototype, throwaway or proof of concept, or asks to try something before committing to it.
- Not for a look or a layout to choose: `designing` renders directions side by side and owns that choice.
- Not for a change already decided: `implementing-batch` builds it.
- Not for a failure with an unproven cause: `debug` owns it.

## The loop

1. **Write the question down.** One sentence that ends in a question mark, plus the observation that would settle it each way; an experiment without both settles nothing.
2. **Sort logic from look.** A question about how logic, state or data behaves stays here; a question about what a surface looks like leaves for `designing`, which already builds rival directions.
3. **Build the least that answers it.** One command runs it, and what it prints or shows is the observation step 1 named, so the answer is read off the run and never inferred. When no precedent decides the question and one build would not settle it either, build 2-3 structurally different variants before comparing: `references/exhaust-the-design-space.md`.
4. **Keep production out of reach.** Nothing on a production path imports it, it writes to no store production reads, and it carries no test and no abstraction, because code that real code can reach ships.
5. **Park it on its own branch.** Commit it on `temp/<name>` under a first line that calls it throwaway; never merge that branch, and delete it only once nothing names it as evidence, because a cleanup that removes it removes the proof of the decision.
6. **Record the answer.** Write the question, the observation and the decision into the brief, plan or issue that tracks the work, naming the branch and its commit as the evidence.
7. **Build the decision fresh.** The real change starts from the decision and goes through the ordinary stages; it copies nothing from the branch.

## Red flags

| The excuse | What holds |
|---|---|
| "It works, so wire it in." | It has no test, no failure handling and no owner, and wiring it in ships all three gaps. |
| "Let it save its state so the run survives a restart." | Storage is the first production concern, and it is what turns an experiment into code nobody dares delete. |
| "Merge the branch, it is only a demo." | The branch is the evidence; merged, it is code the next reader believes. |

## References

| File | Read it when |
|---|---|
| `references/exhaust-the-design-space.md` | Step 3, when the question has no precedent and one build would not settle it. |

## Judgment

- The written question outranks the shape the experiment wants to grow into.
- A decision recorded with its branch outranks experiment code kept in the tree.
- The throwaway rules outrank every convention this repository enforces on production code.
