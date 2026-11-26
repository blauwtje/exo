---
type: llm
weight: 1
---

Read the final message. Pass only when all of these hold:

- It names the path of the brief written under `docs/specs/`.
- It says nothing was built or committed as code.
- It takes no silent default: each choice the request leaves open that no code or web source settles is asked as a question for the user, listed under `## Open points` in the brief, or named in the message as a default taken because the request allowed defaults.
- It says what runs next: the build.
