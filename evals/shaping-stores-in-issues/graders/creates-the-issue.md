---
type: llm
criteria: 'The response creates exactly one GitHub issue with `gh issue create`, whose body starts with the line `<!-- exo:spec -->` followed by the brief. It labels the issue only with labels the repository already has (such as `enhancement`, `area: alerts` and one `size:` label) and creates no label. It writes no `docs/specs/` file and shows no draft for approval before creating. The final message names the issue and ends on plain lines numbered `1.` and `2.`: `1.` Planning, its label in bold and marked "(Recommended)" or the same word in the reply''s language, which runs `/exo:planning #<n>` when picked; `2.` stopping. A response that writes a spec file, creates a `type:`, `priority:` or `effort:` label, asks approval before creating, or asks through a question tool fails.'
---

Passes when the brief lands in one repository-labelled issue and the turn ends on the planning question for that issue.
