# Prompt engineering

Checked: 2026-11-16

Read it when: you write or change a prompt, skill, agent brief or delegation text.

- **Start minimal, then refine against observed failures.** A short prompt shows what the model gets wrong before you add rules. [1] exo: `skills/author/SKILL.md`
- **Say exactly what output you want.** The model infers no unstated format. [2] exo: `agents/researcher.md`
- **Say what to do, not what to avoid.** Add a short reason only to a judgment rule, because it covers unlisted cases. [2][11] exo: `skills/author/references/instruction-style.md`
- **Use a few canonical examples, not lists of edge-case rules.** [1] exo: `skills/author/references/instruction-style.md`
- **Turn subjective judgments into concrete grading criteria.** [3] exo: gap
- **Write names and descriptions for the trigger decision.** A distinct description routes correctly. [4][7] exo: `skills/author/SKILL.md`
- **Ask for every finding, then filter in a second pass.** Opus 5.5 reads "only high-severity" literally. [6] exo: `skills/build/SKILL.md`
- **Explain why instead of CAPS, MUST or "if in doubt, use X".** Opus 5.5 overtriggers. [6][8] exo: `skills/author/references/instruction-style.md`
- **Drop "double-check" and "final verification" steps.** Opus 5.5 over-verifies. [6] exo: `agents/researcher.md`
- **Think before coding: settle open decisions.** [9] exo: `skills/spec/SKILL.md`
- **Mark a skill manual-only.** The pinned sources mark their mode skill manual-only. [12] exo: conflict with [4], decided: stay model-invoked, manual only when its route eval shows misfires or the user asks
- **Cut a prompt line that changes no decision, and delete a reference with no new content instead of leaving a stub.** [11][13] exo: `skills/author/references/instruction-style.md`
- **Point at the structural source (types, README, config) instead of restating it.** [11] exo: `CONTRIBUTING.md`
- **Encode a rule that keeps coming back as a lint, flag or script and drop the sentence; when only judgment fits, make the instruction prominent and add an example of the failure.** [14] exo: `skills/learn/SKILL.md` looks for an existing check first, decided: a mistake that recurs becomes a check and the sentence it replaces is deleted in the same change; no check for a mistake not seen
- **Restate the user's goal at the start of a task and in every subagent brief.** [12] exo: `skills/build/run-task-prompt.md`
- **Label each claim in a report as measured, inferred or guess, in the same sentence.** [12] exo: `skills/build/SKILL.md`

## Sources

1. Effective context engineering for AI agents, 2025-09-29
2. Best practices for prompt engineering, 2025-11-10
3. Harness design for long-running application development, 2026-03-24
4. Equipping agents for the real world with Agent Skills, 2025-10-16
5. Create custom subagents, undated
6. Prompting Claude Opus 5.5, undated
7. Agent Skills specification, undated
8. Agent Skills best practices, undated
9. Coding guidelines for LLMs, undated
10. Notes on coding with LLMs, 2026-01-26
11. authoring-a-skill playbook, undated
12. mode skill, undated
13. principle-subtract-before-you-add, undated
14. principle-encode-lessons-in-structure, undated
