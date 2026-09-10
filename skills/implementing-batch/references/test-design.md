# Test design

Prove the changed contract through its lowest stable observable boundary. The enemy is a green test coupled to the implementation that can pass while user-visible behavior is wrong. The overcorrection is rebuilding an end-to-end environment for logic a repository test runner already exposes. Choose the nearest existing test level that observes the contract.

## Define the proof

Write one sentence before the test: `Given <public input/state>, the caller observes <output/effect> instead of <old result>.` Select the nearest repository test that can observe that result through a public function, response, event, persisted record, file, or command output.

## Red before green

1. Add or change the test before production behavior.
2. Run only that test against the unchanged behavior.
3. Require a failure caused by the missing behavior, not syntax, setup, fixture, or unrelated failure. Record the assertion and observed value.
4. Make the production change, rerun the same command, and record the passing value.
5. Run the nearest existing suite that owns the changed boundary.

If the test passes before the change, it proves nothing about the change. Tighten the assertion or report that a failing-before test could not be established.

## Assert behavior, not construction

- Assert returned values, status/error contracts, emitted events, persisted state, files, or command output named by the repository contract.
- Do not assert private function calls, call order, local variables, cache layout, or internal object shape unless that item is itself a documented public contract.
- Replace an external system with a test double only at the repository's existing adapter boundary. Assert the request crossing that boundary and the repository-visible result; do not reproduce the implementation inside the double.
- Control time, randomness, concurrency scheduling, and generated identifiers through existing seams so repeated runs have the same assertion inputs.

## Documented boundaries

Add a case only when the changed contract accepts it: absent/empty input, each documented minimum or maximum, malformed input, a named error or permission state, or concurrent access to changed shared mutable state. Do not invent unrelated boundary categories to increase test count.

## Judgment

- A failing-before and passing-after public observation outranks coverage percentage or assertion count.
- Repository test levels and public contracts outrank a new testing abstraction.
- A test coupled to private construction is replaced by the nearest stable observable boundary, even when the private assertion is easier to write.
