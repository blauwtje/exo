Read this when logic or public behavior changes, or an automated test is being added or changed, and the repository exposes an automated test runner, after the baseline, orientation, or reproduction. Read it before the first affected test or production edit; or before writing the first task of any task list, to sort tasks into risky and routine so the risky ones write their test first. (style, text, and version-only changes do not qualify, and report mode never loads it).

# Test design

Prove the changed contract through its lowest stable observable boundary. The enemy is a green test coupled to the implementation that passes while user-visible behavior is wrong. The overcorrection is rebuilding an end-to-end environment for logic a repository test runner already exposes. Choose the nearest existing test level that observes the contract.

## Risky or routine

Risky when any one holds:
- crosses a security boundary;
- changes a persisted format or runs a migration;
- changes a public signature;
- decides money or order;
- fixes a reported bug;
- user asked for test-first.

Else routine: proves itself the ordinary way.

Risky → `## Red before green` as written, quoting failing output before the production edit and passing output after.

## Red before green

1. Add or change the test before production behavior.
2. Run only that test against unchanged behavior.
3. Require a failure caused by the missing behavior, not syntax, setup, fixture, or unrelated failure. Record assertion and observed value.
4. Make the production change, rerun the same command, record the passing value.
5. Run the nearest existing suite owning the changed boundary.

Test passes before the change → proves nothing. Tighten the assertion, or report that a failing-before test could not be established.

## Define the proof

Before the test, write one sentence: `Given <public input/state>, the caller observes <output/effect> instead of <old result>.` Pick the nearest repository test that observes that result through a public function, response, event, persisted record, file, or command output.

## Assert behavior, not construction

- Assert returned values, status/error contracts, emitted events, persisted state, files, or command output the repository contract names.
- Private function calls, call order, local variables, cache layout, internal object shape → do not assert, unless that item is itself a documented public contract.
- External system → test double only at the repository's existing adapter boundary. Assert the request crossing that boundary and the repository-visible result; do not reproduce the implementation inside the double.
- Time, randomness, concurrency scheduling, generated identifiers → control through existing seams, so repeated runs get the same assertion inputs.

## Documented boundaries

Add a case only when the changed contract accepts it: absent/empty input, each documented minimum or maximum, malformed input, a named error or permission state, or concurrent access to changed shared mutable state. No unrelated boundary categories to raise test count.

## Judgment

- Failing-before and passing-after public observation outranks coverage percentage or assertion count.
- Repository test levels and public contracts outrank a new testing abstraction.
- Test coupled to private construction → replace with the nearest stable observable boundary, even when the private assertion is easier.
