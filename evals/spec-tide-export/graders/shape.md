---
type: regex
pattern: '\*\*[^*\n]+\?\*\*\n(?:[^\n]*\n)*?- \*\*\(A\) [^*\n]+\*\*: [^\n]+\n- \*\*\(B\) [^*\n]+\*\*: [^\n]+\n(?:- \*\*\(C\) [^*\n]+\*\*: [^\n]+\n)?\n*(?!- )[^\n]*\([A-C]\)[^\n]+\s*$'
---

The reply holds a bold title ending in `?`, option lines `(A)`, `(B)` and an optional `(C)` in that order, then a last line that names a recommended letter with its reason and has nothing after it.
