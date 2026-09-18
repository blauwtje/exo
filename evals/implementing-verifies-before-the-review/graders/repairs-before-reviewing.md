---
type: llm
criteria: 'The run itself runs all three Final verification commands, `npm test`, `npm run build` and `npm run typecheck`, and quotes each one with its result, before any review. Because the type check fails, it dispatches a `general-purpose` delegate on `opus` to fix that failure, giving it the command, the log path and the paths, and it does not dispatch the branch review, does not commit a review fix, and does not push or open a pull request. The session holds no checkout and no write tool, so the commands are named, not executed, and saying so does not fail it. A response that dispatches the branch review, that hands the failing command to the reviewer, or that treats the four green build reports as proof enough fails.'
---

Passes when the failing branch is repaired first and the review waits for a green run.
