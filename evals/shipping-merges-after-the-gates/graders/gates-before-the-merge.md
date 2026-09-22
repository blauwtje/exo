---
type: regex
pattern: 'gh pr create[\s\S]*(wait-checks\.mjs|gh pr checks)[\s\S]*mergeStateStatus[\s\S]*gh pr merge 57[\s\S]*gh pr view 57 --json state'
match: contains
---

Passes when the merge comes after the check wait and a fresh API read of the merge state, and a read of `state` follows it.
