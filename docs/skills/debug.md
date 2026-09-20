# debug

Finds the cause of a failure before anything is changed.

## When it fires

Existing behavior is reported wrong as a bug, error, crash, regression, broken output or slowdown, and the evidence does not yet name one causal line or boundary plus a mechanism that predicts the symptom. It outranks every other stage until the cause is proven. It stays out when a diagnostic already names the exact file, line and symbol and matches the source.

## What you get

- A reproduction that fails on demand.
- One named cause with the mechanism that explains the symptom, and the predicted fix applied.
- The output lines that prove it, at most ten, with a log path for the rest.

## Where its rules live

`skills/debug/SKILL.md`.
