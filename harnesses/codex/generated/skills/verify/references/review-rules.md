# Review rules for fix findings

The branch reviewer follows these when the dispatch names this file.

## Probe

- Under each `fix` finding, write a line `  Probe: <command>`, directly under the finding.
- A probe is one read-only shell command, run from the root, that exits non-zero now and zero once the finding is fixed.
- Run each probe once and keep it only if it exits non-zero; a finding with no such probe is marked `report`.

## Scope

- With the scope `fix diff`, the diff is `git diff HEAD` plus the files `git ls-files --others --exclude-standard` lists, not the base to HEAD.
- Skip every task-by-task check in that scope.
