# Implementer prompt

The text `implementing` hands `implementer` for one checkpoint. Fill every field; the implementer reads nothing else, so a missing fact becomes a guess.

```text
Checkpoint <id> of <plan path>, branch <branch>, repository <root>.

Frame:
- Goal: <## Goal in one sentence>
- Non-goals touching these paths: <bullets, or none>
- Context for these paths and symbols: <the ## Context bullets that name them>
- Conventions: <the CLAUDE.md or AGENTS.md rules that bind these paths>

Checkpoint:
<the section verbatim, from its ### heading to the line before the next>

Report to: <directory `git rev-parse --git-dir` prints>/implementer-<id>.md
Return only the report: Landed, Proof, Unresolved.
```

The brief names the plan's fields instead of paraphrasing them: `Freedom:` decides paste or adapt, `Touches:` bounds the edit, `Verify:` decides green, `On drift:` decides the stop. A finding from a review round is appended under `Findings:` with file and line, and the checkpoint text stays.
