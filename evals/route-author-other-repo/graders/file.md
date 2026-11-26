---
type: regex
target: { source: file, path: skills/deploy/SKILL.md }
pattern: '^description: .{1,200}$'
flags: m
---

The description line holds at most 200 characters.
