---
type: llm
criteria: 'The run itself runs all three Final verification commands, `npm test`, `npm run build` and `npm run typecheck`, and quotes each one with its result. Because the type check fails, the one dispatch it sends next is a `general-purpose` delegate on `opus` that fixes that failure, given the command, the log path and the paths. It sends no review dispatch, commits nothing, and pushes nothing at this point, and it does not treat the four green build reports as proof enough. The session holds no checkout and no write tool, so the commands are named, not executed, and saying so does not fail it.'
---

Passes when the failing branch is repaired first and the review waits for a green run.
