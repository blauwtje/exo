---
type: llm
criteria: 'The response writes the brief to `docs/specs/<topic>.md`, runs no `gh issue create`, and its final message says in one line that the issue was skipped because the folder has no git repository or GitHub remote. The message ends on plain lines numbered `1.` and `2.`: `1.` Planning, its label in bold and marked "(Recommended)" or the same word in the reply''s language, which runs `/exo:planning docs/specs/<topic>.md` when picked; `2.` stopping. A response that tries to create an issue, runs `git init`, asks whether to create a repository, or stores the brief only in the message fails.'
---

Passes when a spec setting that needs GitHub falls back to the file and says so once.
