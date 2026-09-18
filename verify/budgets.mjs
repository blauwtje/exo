// The corpus contract as data: which skills must exist and what frontmatter may say.

export const EXPECTED_SKILLS = [
  'debug', 'deepen', 'designing', 'implementing', 'implementing-batch', 'planning', 'research', 'savings', 'settings', 'shaping', 'skills-tool'
];

export const EXPECTED_SKILL_PATHS = EXPECTED_SKILLS.map((name) => `skills/${name}/SKILL.md`);

export const ALLOWED_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];
export const ALLOWED_MODEL = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'];

// The always-on budgets, locked to what each measured on the date it names.
// Growth fails, shrinking passes, and no check re-locks itself: a raise is a hand
// edit in the same commit as the text it pays for, which is the whole mechanism.
// The date records when the number was measured; nothing enforces its age.
export const DESCRIPTION_TOTAL_LOCK = { chars: 3889, measured: '2026-09-18' };
export const INJECTED_CONTEXT_LOCK = { bytes: 8940, measured: '2026-09-18' };

// The periodic restatement, locked the same way. It is sent again every
// RESTATE_INTERVAL_BYTES of transcript growth, so a long session pays its size
// several times over.
export const RESTATEMENT_LOCK = { bytes: 3242, measured: '2026-09-18' };
