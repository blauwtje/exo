---
type: regex
target: { source: file, path: src/format.js }
pattern: 'export (?:function|const) \w+[\s\S]*export (?:function|const) \w+'
---

format.js holds a second exported function for the bare amount.
