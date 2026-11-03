---
name: spec
description: "Use when a request leaves done, data, architecture or a trade-off open. When a new visual surface does not name its data or behavior, spec decides those first; design-ui follows for presentation. Not for a clear goal, a failure, or visual-only work."
argument-hint: <outcome to shape>
---

# Shaping

Shaping turns a request into a written brief that settles what done means, so the build starts with no open decision.

## Steps

1. **Gate.**
   - First invoke every installed non-`exo:` skill matching the request.
   - Spec always ends on a brief; with no open decision the brief still gets written.
   - An open decision is one the user would notice that neither request nor code settles.
   - When the diff fits one sentence or code settles every point, ask no question and let exo close each choice.
   - Ask only per `../route-skills/references/question.md` `## When to ask`; the default is zero questions.
   - When the user asked for options, follow `references/architecture-sketch.md` and write no file.
2. **Sort each point.**
   - When running or reading the code answers a point, record the answer and ask nothing.
   - Each open decision passes `## When to ask`. A plain product choice that only the user can make becomes a question, root first; exo decides any other.
   - A decision the user left open stays open despite what the code does.
   - Name the owning layer and a smaller alternative.
3. **Ask one at a time.**
   - Ask per `../route-skills/references/question.md`, and record each choice exo decides in Decisions.
   - Recommend a loaded skill's pattern over an option that skill rules out.
   - Plan approval approves only the `Land:` mode, so ask about it only when `ship` is `ask`.
   - With no git repo or no `origin`, write `Land: local` and ask nothing.
   - After the last answer, write the brief at once, with no recap and no yes question.
4. **Map, then locate.**
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/repo-map.mjs"`, in plan mode too.
   - Dispatch at most eight `exo:locate-code` agents for a range the map leaves out and read none of the files they locate, and run one `exo:fetch-docs` round for outside facts and fill no gap. Send both in the foreground, in one message.
   - Search the map with `grep -n`, so its text stays out of this context.
5. **List tasks** per `references/task-list.md` and `references/brief.md`.
6. **Store it** per `references/brief.md`.
7. **Check it.** Run `node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --plan <brief file> --root <checkout root> --loop`. Fix the flagged lines and any missing heading, `Data:`, Success criterion or `## Manual checks`, working from its output alone.
8. **Find open points** per `references/brief.md` `## Open points step`. Rerun step 7, and leave the flagged `## Open points` unfixed.
9. **Hand off** per `references/hand-off.md`.

## References

| File | Read it when |
|---|---|
| `references/stored-brief.md` | Request names or extends a brief, issue or plan. |
| `../route-skills/references/question.md` | Each question and reply. |
| `references/brief.md` | Before writing the brief; step 8. |
| `references/task-list.md` | Before writing the task list. |
| `references/example-plan.md` | Once, before the first task. |
| `../build/references/data-migration.md` | When its first line applies. |
| `../build/references/test-design.md` | When its first line applies. |
| `../build/references/security.md` | When its first line applies. |
| `references/brief-in-an-issue.md` | `specs` is `issues` or `both`. |
| `../file-issues/references/fields.md` | Before creating that issue. |
| `references/architecture-sketch.md` | Two or more structural shapes compete. |
| `../../docs/principles/README.md` | Request adds or changes an AI agent or LLM worker, its prompt, tools or loop. |
| `references/hand-off.md` | Step 9. |
| `references/watching.md` | Step 9, run started. |
| `references/measured-goal.md` | Goal is a measured score, cost or time on a task set. |

Report: brief location and next stage, or question.
