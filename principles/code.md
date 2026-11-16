# Code engineering

Checked: 2026-11-16

Read it when: you write, refactor or debug code, or you write or judge a test or a proof that code works.

- **Name the data shape first, and encode the domain in a state machine, table or typed model instead of scattered booleans and branches; make the type reject an invalid state.** [1][2][3] exo: `skills/build/references/code-rules.md`
- **Validate at the boundary, trust the types inside, and keep business logic in pure functions behind a thin shell.** [4] exo: `skills/build/references/code-rules.md`
- **Make the smallest change that solves the problem, and remove dead weight before you build; add no speculative validator or guard.** [5][6] exo: `skills/build/references/code-rules.md`
- **Count a reader's load as layers to trace plus state to hold; collapse a wrapper with one caller.** [7] exo: `skills/build/references/code-rules.md`
- **Migrate every caller and delete the old API in one wave, with no compatibility shim.** [8][15] exo: `skills/build/references/code-rules.md`, decided: holds only where no outside user depends on the old form; data in users repositories, such as the old lessons index, keeps its migration
- **Make an operation safe to run twice and after a crash by deriving each step from the current state; a leftover lock or temp file must show as stale.** [9] exo: `skills/build/references/code-rules.md`
- **Fix the first wrong decision, not the place the symptom shows; handle a state only when it is legitimate, and fix every instance of the pattern.** [10] exo: `skills/build/references/code-rules.md`
- **Reproduce first, and ship only a line that traces to runtime evidence; revert what a refuted hypothesis motivated.** [14] exo: `skills/diagnose/SKILL.md`
- **After two fixes fail the same gate, write down the premise they share and test it before the next fix.** [11] exo: `agents/builder.md`
- **Judge a test by two edits: break the behavior and it fails, rewrite the internals and it passes; take the expected value from the requirement.** [12] exo: `skills/build/references/code-rules.md`
- **Pin behavior with a characterization test before a refactor, because a type check or lint is no pin; revert a reshape that cuts no reader load.** [15] exo: `skills/build/SKILL.md` proves a structure change by the same output at base and head
- **Land the failing test first, then the fix, and verify each small unit before the next.** [13][14] exo: `skills/diagnose/SKILL.md` commits the new test alone, then the fix
- **Keep a comment only for a reason an outside dependency forces; a workaround that needs a paragraph means the code is wrong.** [16][17][10] exo: `skills/build/references/code-rules.md`

## Sources

1. principle-model-the-domain, undated
2. principle-type-system-discipline, undated
3. principle-foundational-thinking, undated
4. principle-boundary-discipline, undated
5. principle-laziness-protocol, undated
6. principle-subtract-before-you-add, undated
7. principle-minimize-reader-load, undated
8. principle-migrate-callers-then-delete-legacy-apis, undated
9. principle-make-operations-idempotent, undated
10. principle-fix-root-causes, undated
11. principle-attack-the-premise, undated
12. principle-test-behavior-not-implementation, undated
13. principle-sequence-verifiable-units, undated
14. bug-fix playbook, undated
15. refactoring playbook, undated
16. comment-sicko agent, undated
17. mode skill, undated
