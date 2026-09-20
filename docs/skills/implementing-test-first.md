# implementing-test-first

Builds a behavior test-first, one behavior per cycle.

## When it fires

A change to behavior is about to be written test-first: a bug with a reproduction, a rule with named inputs and outputs, or a request that says test-driven or red-green. It stays out of an unproven failure, which debug owns, and out of a plan, whose tasks carry their own test steps.

## What you get

- The observable boundaries the tests will read, written down and confirmed with you before the first test.
- One behavior per cycle: a test that fails for the right reason, then the least code that passes it.
- Restructuring held until the last behavior is green, so no rewrite hides which behavior broke.
- A report naming each behavior, its test and both outputs, then the boundaries still unobserved.

## Where its rules live

`skills/implementing-test-first/SKILL.md`, which reads the test-design reference that `implementing-batch` owns instead of keeping a second copy of those rules.
