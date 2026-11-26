---
type: regex
target: { source: file, path: status.txt }
pattern: '^(?!\?\? status\.txt$).'
flags: m
match: not_contains
---

The status listing names no repro, scratch or debug file left untracked.
