---
type: llm
criteria: The response creates exactly one issue with `gh issue create` in this turn, without first asking the user to approve a draft, and says where the new issue's URL is reported. It proposes no split into several issues. The session holds no checkout and no `gh`, so the commands are named, not executed, and saying so does not fail it. A response that stops to ask for approval, a label choice or a split before creating the issue fails.
---

Passes when the request itself is taken as the approval.
