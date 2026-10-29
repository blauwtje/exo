// The corpus contract as data: which skills must exist and what frontmatter may say.

export const EXPECTED_SKILLS = [
  'find-cause', 'design-ui', 'save-session', 'build', 'gate', 'file-issues', 'remember', 'refactor', 'check-docs', 'configure', 'spec', 'ship', 'edit-skills', 'write-docs', 'start', 'run-plan', 'prompt', 'improve'
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
// hooks/session-start.mjs injects only this context: the pointers, the settings line
// and the text of hooks/session-routing.md and hooks/session-rules.md, which stays far under the cap.
export const HOOK_OUTPUT_CAP = { chars: 10000 };
export const DESCRIPTION_TOTAL_LOCK = { chars: 2566, measured: '2026-10-29' };
// Every plugin agent's description, in the Agent tool listing of every session.
// Lowered 803 -> 510 when the nine dispatched-only agents got short descriptions (round 2 merge).
export const AGENT_DESCRIPTION_TOTAL_LOCK = { chars: 510, measured: '2026-10-20' };
// The authored text of hooks/session-routing.md and hooks/session-rules.md, summed, which the session hook injects.
// This lock covers the authored text only; SESSION_START_BYTES_LOCK below locks the whole hook output.
// Set 1777 -> 1580 in the round 2 merge: dispatch-only rules left for hooks/dispatch-rules.md (-464),
// the confirm-before-undoable line came in from the now opt-in compression rule, and the done-rule clauses grew.
// Raised 1600 -> 1606 and 1739 -> 1745: "no reruns" became "no repeat loops", so a rerun after a fix stays allowed.
// Raised 1580 -> 1600 when the proof rule split into reuse-a-failing-check and one-run-per-variant bullets (same words, more arrows).
// Raised 1606 -> 1787 with the TaskStop rule line.
// Raised 1787 -> 1978 when the delete-would-unblock rule became the green-command-as-typed rule.
export const INJECTED_CONTEXT_LOCK = { bytes: 3063, measured: '2026-10-29' };
// Lines of hooks/**/*.mjs plus lib/hook-input.mjs, which run on every Bash call
// and session start; verify/checks/hook-size.mjs fails above it.
export const HOOK_LINES_LOCK = { lines: 1333, measured: '2026-10-14' };
export const HOOK_SPAWN_MS_LOCK = { ms: 75, measured: '2026-10-29' };
// Bytes of each tests/*.mjs file; verify/checks/test-size.mjs fails above it, so a
// large test file is split before it lands.
export const TEST_FILE_CAP = { bytes: 40 * 1024 };
// Words every session loads before the first prompt: the session-start output,
// each model-invocable skill's name and description, each agent's name and
// description; verify/checks/session-load.mjs fails above it.
// Lowered 909 -> 635 in the round 2 merge: dispatch-only rules moved to the Agent hook, compression rule
// text became the opt-in exo:short style, agent descriptions shortened; done-rule clauses added words back.
// Raised 636 -> 667 with the TaskStop rule line.
// Raised 667 -> 669 with the context limit on the settings line.
// Raised 669 -> 703 with the green-command-as-typed rule.
export const SESSION_LOAD_LOCK = { words: 1110, measured: '2026-10-29' };
// Bytes of the whole additionalContext hooks/session-start.mjs injects (pointers, settings line with
// its compression rule text, routing and rules text), measured in an empty home and folder;
// verify/checks/session-load.mjs fails above it.
// Lowered 3011 -> 1719 in the round 2 merge: dispatch-only rules delivered at the first Agent call, compression
// off by default so no rule text rides the settings line; done-rule clauses added bytes back.
// Raised 1719 -> 1739 with the proof-rule split above.
// Raised 1745 -> 1926 with the TaskStop rule line.
// Raised 1926 -> 1950 with the context limit on the settings line.
// Raised 1950 -> 2141 with the green-command-as-typed rule.
export const SESSION_START_BYTES_LOCK = { bytes: 3169, measured: '2026-10-29' };
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
// states and the checks name in their PASS detail.
export const BYTES_PER_TOKEN = 4;
export const SKILL_BODY_TOKENS = { realistic: 2000, ceiling: 2500 };
// The six stage-path skills, capped at 750 tokens each. spec sits above the
// cap because its pinned gate sentences hold it at its measured 790.
// Raised 783 -> 790: the principles row names AI agent work (0/3 -> 3/3 runs opened the index, benchmarks/results/2026-10-22-spec-principles-read-reworded.md).
export const STAGE_BODY_TOKENS = {
  'start': 750, 'spec': 840, 'build': 750, 'gate': 750, 'find-cause': 750, 'ship': 750,
};
// Every plugin agent's body, stripped of its own frontmatter, stays within this
// ceiling. An agent is exempt only by exact name, never by pattern.
export const AGENT_BODY_TOKENS = { ceiling: 750, exempt: [] };
// Every stage-path reference and every prompt a stage skill's own table names
// (a row whose target is not under references/) stays within 750 tokens,
// unless it is locked here at its measured size. A lock fails a file that
// grows past it and a file that shrinks without the lock following, so a
// lock only ever moves down; a locked file that drops to 750 tokens or under
// leaves this map. Token counts are Math.round(bytes / BYTES_PER_TOKEN).
export const REFERENCE_TOKEN_LOCKS = {
  'skills/build/references/critique.md': 797,
  'skills/build/references/data-migration.md': 874,
  'skills/build/references/security.md': 999,
  // test-design.md and task-list.md grew for the red-green rules of plan
  // autonomous-exo-5 Task 10; their older rules stay whole.
  'skills/build/references/test-design.md': 921,
  'skills/build/references/wave-worktrees.md': 920,
  'skills/build/run-task-prompt.md': 788,
  'skills/ship/references/pr-prep.md': 772,
  'skills/spec/references/brief.md': 909,
  'skills/spec/references/task-list.md': 903,
};
// skills/route-skills/references/lean.md, read before every code edit, sits
// under the 750 tokens REFERENCE_TOKEN_LOCKS starts at, so it is locked in
// bytes, the same two ways: growth fails and so does a shrink the lock does
// not follow.
export const LEAN_REFERENCE_LOCK = { bytes: 1008, measured: '2026-10-08' };
export const DESCRIPTION_CHARS = { realistic: 200, ceiling: 250 };
export const DESCRIPTION_TOTAL_WARN = { chars: 5175 };
export const REFERENCE_CONTENTS_LINES = 100;
export const PRINCIPLE_PAGE_TOKENS = 800;
export const PRINCIPLE_INDEX_TOKENS = 300;
