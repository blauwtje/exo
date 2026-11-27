---
name: diagnose
description: "Finds a bug's proven root cause, then fixes it with a test seen red first. Use when something fails, crashes or slows down ('why does X fail', 'this broke', 'debug this'). Not for missing features."
argument-hint: "symptom, failing command or error"
model: opus
effort: medium
---

# Diagnose

**No fix without a reproduction.** A fix for a guessed cause hides the bug and often adds a second one. Your job is to turn "it is broken" into one command that shows the failure, then into a cause that predicts what you see, and only then into a fix.

Read `${CLAUDE_PLUGIN_ROOT}/BASE.md` first.

## 1. Build the feedback loop

This is most of the work, so spend your effort here. Find one command that goes red on *this* bug: a failing test, a curl against the dev server, a CLI run on a fixture, a script that replays a captured input. Make it fast and make it give the same answer every run. Send long output to a file in `<scratch>` and read the end.

- **It worked before:** run `git bisect run <repro>` from a known good commit. The first bad commit's diff holds your first suspects.
- **It fails only after another test:** bisect the test files, with the failing test last, to find the one that leaves state behind.
- **It fails only sometimes:** raise the failure rate before you hunt. Loop the repro, narrow the input, pin the clock, seed the random generator. A bug that shows once in a hundred runs cannot be fixed with confidence.
- **It is slow:** time the path at least five times and keep the median and the spread. One run cannot tell a fix from noise.
- **No loop at all:** stop and say so. List what you tried and ask for access, a captured artifact or permission to add logging. Do not guess your way forward.

The loop is ready when:

- [ ] one command shows the failure
- [ ] it gives the same answer every run
- [ ] it runs in seconds
- [ ] you quoted its failing output

## 2. Find the cause

Keep two hypotheses alive and look once at the place where they predict different things. When a similar input or code path works, list every difference from the failing one and remove them one by one until the symptom clears.

A cause is proven when you can name the line and the mechanism, and the mechanism predicts the symptom you saw. "This looks wrong" is not a cause.

When reading code alone does not get you there, send a fresh `exo:researcher` with the symptom, the repro, what you ruled out and a result file in `<scratch>`. Read only its conclusion.

## 3. Fix it and prove it

1. **Predict.** Write down the cause and which output the fix will change.
2. **Red.** Write a test that fails for that cause, and quote its failure.
3. **Fix.** Search for the same pattern with `rg` and fix every instance of this cause in the same change. A fix that must touch a second module for any other reason means the cause is not found yet: go back to step 2.
4. **Green.** Quote the test passing, then rerun the original repro and the suite. A flaky bug is fixed when the loop that failed before passes five runs in a row. A speed fix stays only when the new median beats the old spread.
5. **Review.** When the fix touches more than two files, adds a dependency, changes a public signature or crosses a stored format or a security boundary, run the `code-review` skill at level `low` and fix what it finds.

Never revert or stash the user's work to show red.

```text
Bad:  skip the header when page > 1. The symptom goes; the loop still writes it.
Good: move the header write out of the page loop at src/export.rs:88. The cause goes.
```

## Excuses

| You think | Do instead |
|---|---|
| "I can see the bug, no need to reproduce it." | Then the repro takes a minute. Write it; it becomes the test. |
| "Let me try this fix and see." | A fix is an experiment only when you predicted its result first. |
| "It passes now." | Once? Run the loop that used to fail. |

## Report

```text
Cause: src/export.rs:88 writes the header inside the page loop, so every page after the first repeats it. (measured)
Proof: `cargo test one_header` failed with 3 headers before the fix and passes after; repro and suite pass.
Open: exports over 10,000 rows not tried.
```

Label each claim measured, inferred or guess. When the cause is not proven, report the repro, what you expected, what happened and your hypotheses, and change no code.

Next: `exo:ship`, when the user wants the fix pushed.
