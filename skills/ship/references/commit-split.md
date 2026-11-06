# Commit split

Goal: turn a dirty tree into ordered commits that together equal the tree, applied only on the user's yes.

## When

- The tree has uncommitted changes the user wants shipped, and `git log` of the branch does not already hold them.
- Skip it for a tree `build` already committed, and for one change that is one purpose: commit it as one.

## Steps

1. List the changed files: `node "${CLAUDE_SKILL_DIR}/scripts/commit-split.mjs" --list`. It prints a status letter and path per line, untracked files included, renames as a delete plus an add.
2. Read `git log --format=%s -20` and copy its type and scope vocabulary.
3. Group whole files by purpose, in dependency order: schema or storage, core logic, wiring, surface behavior, tests, docs. A file sits in exactly one group.
   - Group at file level. A file that serves two purposes goes to the group it most serves; name the mix in that group's `body`.
4. Write the plan to a temp file as JSON: `{"groups":[{"subject":"type(scope): subject","body":"optional","files":["path"]}]}`.
5. Show the proposal with `node "${CLAUDE_SKILL_DIR}/scripts/commit-split.mjs" --plan <file>`, quote its stdout and ask `Apply this split? (yes/no)`. A refusal prints every problem; fix the plan and rerun, nothing is committed.
6. On a yes, rerun with `--apply`. It commits each group in order and stops with exit 1 if the final tree differs from the original tree.

## Rules

- The script refuses a plan that omits a changed file, lists a file twice or one that is not changed, has an empty group, a non-conventional subject, or text that credits an AI.
- Apply resets the index first, so a hand-staged split is replaced by the plan. The working tree is never touched.
- Commit hooks run as usual; a failed hook stops the split with the earlier commits kept and the rest left in the tree.
- A pushed commit is never rewritten here; the split only adds new commits on the current branch.
