# Refactor

Change structure with behavior pinned; leave less code than you found. The enemy is the half-finished move: old API kept beside the new, a shim forwarding to it, or a reshape trusted because it type-checks. The overcorrection is a refactor growing layers for needs nobody has written yet.

## When to use

- Named rename, move, extraction, split, flattening or reshape of an internal API whose results must not change.
- Pull to keep the old signature, accept both shapes, or leave a re-export "for compatibility".
- Not for a behavior change: `build` owns it; mixed request → refactor first, then the change.
- Not for persisted data, a stored format or a consumer outside this repository: `build` keeps those compatible on purpose via the data-migration reference.
- Not for a failure with unproven cause: `find-cause` owns it.
- A lean rewrite of a whole repo or folder, hundreds of files: the repo-wide run below.

## The loop

1. **Pin behavior before the first move.** Capture current outputs in a test, snapshot or before/after script over the inputs that matter.
2. **Name the target shape.** One sentence: module layout and call graph as if built today. Reshape removes branches, layers or states and adds no indirection.
3. **Subtract first.** Delete code the reshape makes dead before building the new shape; report other dead code.
4. **Migrate every caller, then delete the old API, in the same change.** No shim, deprecated wrapper, both-shapes signature or re-export stays, because nothing then forces the last caller over. Search strings, docs, scripts and tests too; renames miss usages there.
5. **Build no seam for a future caller.** No base class, registry, factory or flag with one implementation; a seam arrives with its second adapter. Drop unused sketch code instead of finishing it.
6. **Prove equality on the real code.** Rerun the pin against old and new versions, quote the comparison; "it compiles" or a green suite that never covered the moved code proves nothing.
7. **Keep it only if reading got easier.** Revert a step that adds net lines without removing a branch, layer or state, or that adds a file to trace.
8. **Report.** The report rule in the closing reference; equality evidence, line counts and reverted changes go behind the pointer.

## Repo-wide run

Review-and-replan rounds are the time sink of a repo-wide rewrite, so one rubric written up front and batch fan-out replace them. The loop above holds per file; each file's pin is its covering tests.

- **Phase 0, candidates.** One cheap deterministic pass, the project's own dead-code and duplicate tools or `npx knip` and `npx jscpd`, lists unused files, exports and repeated blocks. It feeds candidates only; nothing is fixed without the rubric and a worker.
- **Phase 1, Rubric and golden files.** The strongest tier writes, once per run, `.exo/<run>/rubric.md`: one checkable rule per finding kind, each a yes or no question answered from the file alone, seeded from past review findings under `.exo/` and `${CLAUDE_PLUGIN_ROOT}/lib/references/lean.md`. It also writes one golden example per file type (skill, agent, hook, script, lib, test) under `.exo/<run>/golden/`, a real file rewritten to pass every rule.
- **Phase 2, calibration.** Run the Rubric on 3 files of different types, read the diff, sharpen each rule that let a defect through or forced a wrong edit, then discard the output.
- **Phase 3, batches.** Shard the files into batches of many files of one type, one plan task and one land per batch; a wave holds `defaults.waveLimit` tasks. Sonnet-tier workers write. Every brief starts with the Rubric and the golden files, byte for byte the same in each, so the prompt cache serves that prefix; the batch's file list follows. A worker runs only the tests covering its files plus `npm run validate:static`.
- **Phase 4, retry.** A file that fails validation goes back to a worker with its error lines, at most 3 times. A finding seen in 2 or more files is a Rubric gap: edit the Rubric and rerun only the files it affects.
- **Phase 5, final review.** One strongest-tier review of the whole diff for lost rules or behavior, with no review-replan rounds; its findings go to one fix pass, then `npm run check` runs once.
- **Stop.** At about 95% of files passing the Rubric, stop and report the rest by path with the rule each fails.

## Red flags

| The excuse | What holds |
|---|---|
| "No time for tests on a mechanical split." | A throwaway comparison script takes minutes, no committed test needed. |
| "Leave it extensible for the variants coming later." | One-implementation seam = indirection; the next variant adds its seam when it lands. |

## Judgment

- Pin outranks target shape: revert a step that breaks it and leave the pin as is.
- Deletion outranks addition when both reach the target shape.
