---
name: spec
description: "Use when a request leaves done, data, architecture or a trade-off open. When a new visual surface does not name its data or behavior, spec decides those first; design-ui follows for presentation. Not for a clear goal, a failure, or visual-only work."
argument-hint: <outcome to shape>
---

# Shaping

## Steps

1. **Gate.**
   - First invoke every installed non-`exo:` skill matching the request.
   - Spec always ends on a brief; with no open decision the brief still gets written.
   - An open decision is one the user would notice that neither request nor code settles.
   - Diff fits one sentence or code settles every point → no question, exo closes each choice; ask only what to build.
   - Asked for options → per `references/architecture-sketch.md`, no file.
2. **Sort each point.**
   - Answerable by running or reading → record, never ask.
   - Each open decision is a question, root first.
   - A decision the user left open stays open despite code.
   - Name the owning layer, a smaller alternative.
3. **Ask one at a time.**
   - Ask per `../route-skills/references/question.md`; decide nothing silently.
   - Recommend a loaded skill's pattern over an option it rules out.
   - `Land:` → plan approval approves only its mode; ask only if `ship` is `ask`.
   - No git repo or `origin` → `Land: local`, no question.
   - Last answer → brief now, no recap, no yes question.
4. **Map, then locate.**
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/repo-map.mjs"`, plan mode too.
   - Unmapped range → `exo:locate-code`, at most eight, read none located; outside facts → one `exo:fetch-docs` round, no gap-fill; both foreground, one message.
   - `grep -n` the map; never `cat`, `head` or `sed` it.
5. **List tasks** per `references/task-list.md` and `references/brief.md`.
6. **Store it** per `references/brief.md`.
7. **Check it.** Run `node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --plan <brief file> --root <checkout root> --loop`; fix flagged lines, any missing heading, `Data:`, Success criterion or `## Manual checks`; read its output, never its source.
8. **Find open points** per `references/brief.md` `## Open points step`; rerun step 7, leaving flagged `## Open points` unfixed.
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
