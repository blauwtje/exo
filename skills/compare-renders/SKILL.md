---
name: compare-renders
description: Use when the user invokes it to prove that a refactor, migration or dependency bump leaves every rendered surface pixel-identical. Not for a change meant to look different, which design-ui owns, or a behavior pin with no rendered surface, which refactor owns.
argument-hint: "<surface or components to migrate, and the URL that renders them>"
disable-model-invocation: true
---

# Visual parity

The baseline capture is the specification, and only an exact pixel diff against it proves that nothing visible changed. The enemy is parity claimed by eye, or bought by editing the baseline, the harness or the markup until the diff goes quiet. The overcorrection is freezing a harness that renders differently on every run, so every diff fails on noise and the loop never ends.

## When to use

- The user invokes it for a refactor, a framework or styling migration, or a dependency bump whose rendered result must not move.
- Not for a change that aims at a new look: `design-ui` owns that, and its critique judges change this skill forbids.
- Not for a behavior-preserving change with no rendered surface: `refactor` pins that with a test.

## The loop

1. **Name the scope.** List the components, the states each shows, the viewports and the color schemes, with shared primitives first; what is not captured is not proven.
2. **Capture the baseline before the first edit.** This step blocks: no baseline, no parity claim. When edits already exist, capture from a worktree at the base commit, never from the edited tree.
3. **Prove the harness stable.** Capture the baseline twice and diff the two; a nonzero diff is harness noise, fixed now, because after the first edit noise and drift look the same.
4. **Freeze.** Record the baseline directory and the commit it came from; from here the baseline and the harness are read-only. When the baseline itself looks wrong, stop and ask rather than recapture.
5. **Migrate one component at a time, shared primitives first.** A primitive changed after its consumers were diffed invalidates every one of those diffs.
6. **Diff the component.** Capture it with the same URL, state, viewport and scheme, then run `scripts/pixel-diff.mjs`; exit 0 is the only pass.
7. **Loop on a failure.** Any nonzero count is a fail that goes back to the code, located by the printed box, until the count reaches zero or the user accepts that named difference.
8. **Report.** Per component, the diff line of every pair; the baseline directory and commit; each accepted difference with its count, box and cause; what is left.

## Red flags

| The excuse | What holds |
|---|---|
| "The screenshots look the same." | Sub-pixel radius, a one-step color shift and a fallback font all pass the eye and fail the diff. |
| "It is only a few pixels." | Nonzero is a fail; only the user can accept a named difference. |
| "The baseline is outdated, recapture it." | A recaptured baseline records the migration as the specification; stop and ask. |
| "Wrap it differently and the diff passes." | Markup reshaped to move pixels out of the capture hides the drift it was built to catch. |
| "Raise the threshold for antialiasing." | Noise is fixed in step 3, before the freeze; the comparison has no tolerance to raise. |

## References

| File | Read it when |
|---|---|
| `references/capture-harness.md` | Steps 2, 3 and 6: the capture commands, stable rendering and the pairing of files. |

## Judgment

- The frozen baseline outranks a deadline: a pass that needs an edit to the baseline or harness is reported as a fail.
- A user-accepted difference outranks a zero diff, and it covers only its named count and box; any other change reopens it.
- One component proven at a time outranks a batch, because a batch diff cannot say which change moved which pixel.
