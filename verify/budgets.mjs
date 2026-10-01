// The corpus contract as data: which skills must exist and what frontmatter may say.

export const EXPECTED_SKILLS = [
  'find-cause', 'design-ui', 'save-session', 'build', 'verify', 'file-issues', 'remember', 'refactor', 'check-docs', 'configure', 'spec', 'ship', 'edit-skills', 'write-docs', 'start'
];

export const EXPECTED_SKILL_PATHS = EXPECTED_SKILLS.map((name) => `skills/${name}/SKILL.md`);

export const ALLOWED_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];
export const ALLOWED_MODEL = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'];

// The always-on budgets, locked to what each measured on the date it names.
// Growth fails, shrinking passes, and no check re-locks itself: a raise is a hand
// edit in the same commit as the text it pays for, which is the whole mechanism.
// The date records when the number was measured; nothing enforces its age.
// First-party documentation caps one hook output string at HOOK_OUTPUT_CAP
// characters and hands the model a 2,000-character preview of a longer one.
// hooks/session-start.mjs puts the pointers and the settings line before the
// route-skills body and cuts the tail of that body before it passes the cap, so the
// next addition to route-skills buys its bytes out of that body.
export const HOOK_OUTPUT_CAP = { chars: 10000 };
export const DESCRIPTION_TOTAL_LOCK = { chars: 3561, measured: '2026-09-28' };
export const INJECTED_CONTEXT_LOCK = { bytes: 2540, measured: '2026-09-30' };

// The rendered project-memory file, which a session opens by path. It is a
// ceiling the writer enforces before it writes, not a lock the verifier reads:
// a file that only grows costs more to read than it saves, and one irrelevant
// line measurably lowers accuracy.
export const MEMORY_BUDGET = { bytes: 2000, measured: '2026-09-18' };

// Skill size. Tokens are the body's bytes after the frontmatter divided by
// BYTES_PER_TOKEN, the sizing convention for skill text. The ceiling fails; realistic is the aim edit-skills
// states and the checks name in their PASS detail. route-skills has its own
// ceiling because hooks/session-start.mjs injects its body into every session.
export const BYTES_PER_TOKEN = 4;
export const SKILL_BODY_TOKENS = { realistic: 2000, ceiling: 2500 };
export const INJECTED_BODY_TOKENS = { skill: 'route-skills', ceiling: 636 };
// The six stage-path skills, capped at 750 tokens each. spec sits above the
// cap because its pinned gate sentences hold it at its measured 837.
export const STAGE_BODY_TOKENS = {
  'start': 750, 'spec': 837, 'build': 750, 'verify': 750, 'find-cause': 750, 'ship': 750,
};
// Every plugin agent's body, stripped of its own frontmatter, stays within this
// ceiling. build-ui, survey-ui, critique-ui and its twin carry visual-direction context
// no other agent needs, so they are exempt by exact name, never by pattern.
export const AGENT_BODY_TOKENS = { ceiling: 750, exempt: ['build-ui', 'survey-ui', 'critique-ui', 'critique-ui-high'] };
// Every stage-path reference and every prompt a stage skill's own table names
// (a row whose target is not under references/) stays within 750 tokens,
// unless it is locked here at its measured size. A lock fails a file that
// grows past it and a file that shrinks without the lock following, so a
// lock only ever moves down; a locked file that drops to 750 tokens or under
// leaves this map. Token counts are Math.round(bytes / BYTES_PER_TOKEN).
export const REFERENCE_TOKEN_LOCKS = {
  'skills/spec/references/task-list.md': 768,
  'skills/build/references/critique.md': 841,
  'skills/build/references/data-migration.md': 901,
  'skills/build/references/run-loop.md': 868,
  'skills/build/references/security.md': 1061,
  'skills/build/references/test-design.md': 906,
  'skills/build/references/wave-worktrees.md': 958,
  'skills/find-cause/references/profiling.md': 854,
  'skills/ship/references/pr-prep.md': 1029,
  'skills/build/bug-fixer-prompt.md': 896,
  'skills/find-cause/fixer-prompt.md': 823,
};
export const DESCRIPTION_CHARS = { realistic: 300, ceiling: 375 };
export const DESCRIPTION_TOTAL_WARN = { chars: 5175 };
export const REFERENCE_CONTENTS_LINES = 100;
