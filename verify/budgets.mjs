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
export const DESCRIPTION_TOTAL_LOCK = { chars: 2542, measured: '2026-10-08' };
// Every plugin agent's description, in the Agent tool listing of every session.
export const AGENT_DESCRIPTION_TOTAL_LOCK = { chars: 739, measured: '2026-10-08' };
export const INJECTED_CONTEXT_LOCK = { bytes: 2067, measured: '2026-10-06' };
// Entries in verify/instruction-density-allowlist.txt; a lower count after
// --prune is copied in by hand, and tests fail until it is.
export const INSTRUCTION_DENSITY_ALLOWLIST_LOCK = { entries: 0, measured: '2026-10-02' };

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
export const INJECTED_BODY_TOKENS = { skill: 'route-skills', ceiling: 518 };
// The six stage-path skills, capped at 750 tokens each. spec sits above the
// cap because its pinned gate sentences hold it at its measured 760.
export const STAGE_BODY_TOKENS = {
  'start': 750, 'spec': 760, 'build': 750, 'verify': 750, 'find-cause': 750, 'ship': 750,
};
// Every plugin agent's body, stripped of its own frontmatter, stays within this
// ceiling. build-ui, survey-ui and critique-ui carry visual-direction context
// no other agent needs, so they are exempt by exact name, never by pattern.
export const AGENT_BODY_TOKENS = { ceiling: 750, exempt: ['build-ui', 'survey-ui', 'critique-ui'] };
// Every stage-path reference and every prompt a stage skill's own table names
// (a row whose target is not under references/) stays within 750 tokens,
// unless it is locked here at its measured size. A lock fails a file that
// grows past it and a file that shrinks without the lock following, so a
// lock only ever moves down; a locked file that drops to 750 tokens or under
// leaves this map. Token counts are Math.round(bytes / BYTES_PER_TOKEN).
export const REFERENCE_TOKEN_LOCKS = {
  'skills/build/references/critique.md': 845,
  'skills/build/references/data-migration.md': 912,
  'skills/build/references/security.md': 1040,
  'skills/build/references/test-design.md': 907,
  'skills/build/references/wave-worktrees.md': 962,
  'skills/ship/references/pr-prep.md': 830,
};
// skills/route-skills/references/lean.md, read before every code edit, sits
// under the 750 tokens REFERENCE_TOKEN_LOCKS starts at, so it is locked in
// bytes, the same two ways: growth fails and so does a shrink the lock does
// not follow.
export const LEAN_REFERENCE_LOCK = { bytes: 1030, measured: '2026-10-06' };
export const DESCRIPTION_CHARS = { realistic: 200, ceiling: 250 };
export const DESCRIPTION_TOTAL_WARN = { chars: 5175 };
// Highest Jaccard overlap two model-invocable descriptions may share in
// stopword-filtered words; verify/checks/routing.mjs fails above it.
export const ROUTING_SIMILARITY_CEILING = 0.4;
export const REFERENCE_CONTENTS_LINES = 100;
