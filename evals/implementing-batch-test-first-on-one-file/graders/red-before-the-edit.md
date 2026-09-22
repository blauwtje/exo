---
type: regex
pattern: 'test/time/duration\.test\.ts[\s\S]*vitest[\s\S]*(fail|FAIL|✗|×|NaN)[\s\S]*src/time/duration\.ts[\s\S]*vitest'
match: contains
---

Passes when the test file and a failing vitest run come before a change to the source file and a second run.
