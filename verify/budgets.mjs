// The corpus contract as data: which skills must exist and what frontmatter may say.

export const EXPECTED_SKILLS = [
  'debug', 'deepen', 'designing', 'implementing', 'implementing-batch', 'implementing-test-first', 'memory', 'planning', 'prototyping', 'research', 'savings', 'settings', 'setup', 'shaping', 'skills-tool'
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
// hooks/session-start.sh appends a settings line and two pointers that carry
// absolute paths, and leaves a pointer out before it passes the cap, so the next
// addition to using-exo buys its bytes out of that body.
export const HOOK_OUTPUT_CAP = { chars: 10000 };
export const DESCRIPTION_TOTAL_LOCK = { chars: 4621, measured: '2026-09-20' };
export const INJECTED_CONTEXT_LOCK = { bytes: 9101, measured: '2026-09-20' };

// The periodic restatement, locked the same way. It is sent again every
// RESTATE_INTERVAL_BYTES of transcript growth, so a long session pays its size
// several times over.
export const RESTATEMENT_LOCK = { bytes: 3242, measured: '2026-09-18' };

// The rendered project-memory file, which a session opens by path. It is a
// ceiling the writer enforces before it writes, not a lock the verifier reads:
// a file that only grows costs more to read than it saves, and one irrelevant
// line measurably lowers accuracy.
export const MEMORY_BUDGET = { bytes: 2000, measured: '2026-09-18' };

// A skill body is loaded whole when its skill fires and stays in the context
// for the rest of the session. 15,000 bytes is about 3,750 tokens, under the
// 500 lines first-party guidance sets for a body, and the smallest round number
// the largest body, designing's, fits under once its phases live in references.
export const SKILL_BODY_LIMIT = { bytes: 15000 };
