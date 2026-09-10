# Implementer prompt

The text `implementing` hands `implementer` for one task. Fill every field; the implementer reads nothing else, so a missing fact becomes a guess.

```text
Task <n> of <plan path>, branch <branch>, repository <root>.

Frame:
- Goal: <## Goal in one sentence>
- Non-goals touching these paths: <bullets, or none>
- Context for these paths and symbols: <the ## Context bullets that name them, including every shared signature>
- Conventions: <the CLAUDE.md or AGENTS.md rules that bind these paths>

The task section:
<the section verbatim, from its `### Task <n>:` heading to the line before the next>

Report to: <directory `git rev-parse --git-dir` prints>/implementer-<n>.md
Return only the report: Landed, Proof, Unresolved.
```

The brief names the plan's fields instead of paraphrasing them: `Files:` bounds the edit, each step's code is what to write, `Run:` and `Expected:` decide green, and the `Commit:` block is the caller's, never the implementer's. A finding from a review round is appended under `Findings:` with file and line, and the task text stays.
