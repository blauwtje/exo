# Review rules for fix findings

Branch reviewer follows these when the dispatch names this file.

## Probe

- Each `fix` finding → line `  Probe: <command>` directly under it.
- Probe = one read-only shell command, run from the root, exiting non-zero now and zero once fixed.
- Run each probe once; keep it only if it exits non-zero; no such probe → mark the finding `report`.

## Scope

- Scope `fix diff` → diff is `git diff HEAD` plus files `git ls-files --others --exclude-standard` lists, not base to HEAD.
- Scope `fix diff` → skip every task-by-task check.
