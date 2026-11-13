---
name: spec
description: "Use when a request leaves done, data, architecture or a trade-off open. When a new visual surface does not name its data or behavior, spec decides those first; design-ui follows for presentation. Not for a clear goal, a failure, or visual-only work."
argument-hint: <outcome to shape>
---

# Shaping

Shaping turns a request into a brief that settles what done means, so the build starts with no open decision.

## Steps

1. **Gate.**
   - First invoke every installed non-`exo:` skill matching the request.
   - Spec ends on a brief unless the verdict is `stop`; with no open decision the brief still gets written.
   - Open with the verdict. An open decision is one the user would notice that neither request nor code settles.
   - Fast route: under three files with a known proof, skip questions, plan and gate; one worktree worker per build `## No spec`.
   - Read `references/verdict.md` for the no-question case.
   - Ask only per `../../lib/references/question.md` `## When to ask`.
   - When the user asked for options, follow `references/architecture-sketch.md` and write no file.
2. **Sort each point.**
   - When running or reading code answers a point, record it; ask nothing.
   - Each open decision passes `## When to ask`. A plain product choice only the user can make becomes a question, root first; exo decides any other.
   - A decision the user left open stays open whatever the code does.
   - Name the owning layer and a smaller option.
3. **Ask one at a time.**
   - Ask per `../../lib/references/question.md`, and record each choice exo decides in Decisions.
   - Read `references/step-rules.md` for recommendations and the `Land:` question.
   - After the last answer, write the brief with no recap and no yes question.
4. **Dispatch steps 4 and 5 as one `exo:orchestrator` part** with `Workers: 1`, `Reads: none` and a Result file under `.exo/`. It runs:
   - `node "${CLAUDE_SKILL_DIR}/scripts/repo-map.mjs"`, then `references/step-rules.md`.
   - List tasks per `references/task-list.md`, `references/brief.md` and `references/templates.md`; store per `references/brief.md`.
   - `node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --plan <brief file> --root <checkout root> --loop`; fix flagged lines and any missing heading, `Data:`, Success criterion or `## Manual checks`.
   - Open points per `references/brief.md` `## Open points step`, then rerun plan-check; leave flagged `## Open points` unfixed.
5. **Hand off** per `references/hand-off.md`.

## References

| File | Read it when |
|---|---|
| `references/stored-brief.md` | Request names or extends a brief, issue or plan. |
| `../../lib/references/question.md` | Each question and reply. |
| `references/brief.md` | Before writing the brief; step 4. |
| `references/task-list.md` | Before writing the task list. |
| `references/example-plan.md` | Before the first task. |
| `references/templates.md` | Step 4. |
| `../build/references/data-migration.md` | When its first line applies. |
| `../build/references/test-design.md` | When its first line applies. |
| `../build/references/security.md` | When its first line applies. |
| `references/brief-in-an-issue.md` | `specs` is `issues` or `both`. |
| `../ship/references/fields.md` | Before creating that issue. |
| `references/architecture-sketch.md` | Two or more structural shapes compete. |
| `../../docs/principles/README.md` | Request adds or changes an LLM agent, its prompt, tools or loop. |
| `references/verdict.md` | Step 1. |
| `references/step-rules.md` | Steps 1, 3, 4, mode `research`. |
| `references/hand-off.md` | Step 5. |
| `references/watching.md` | Step 5, run started. |
| `references/research.md` | Mode `research`. |
| `references/sources.md` | Mode `research`. |
| `references/verification.md` | Mode `research`. |
| `references/worker-modes.md` | Mode `research`. |
| `references/ideate.md` | Mode `ideate`. |

Report: brief location, next stage or question.
