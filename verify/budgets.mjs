// The corpus contract as data: which skills must exist and what frontmatter may say.

export const EXPECTED_SKILLS = [
  'find-cause', 'save-session', 'build', 'gate', 'configure', 'spec', 'ship', 'edit-skills', 'write-docs', 'watch'
];

export const EXPECTED_SKILL_PATHS = EXPECTED_SKILLS.map((name) => `skills/${name}/SKILL.md`);

export const ALLOWED_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];
export const ALLOWED_MODEL = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'];

export const DESCRIPTION_TOTAL_LOCK = { chars: 2764, measured: '2026-11-03' };
// Every plugin agent's description, in the Agent tool listing of every session.
// Lowered 803 -> 510 when the nine dispatched-only agents got short descriptions (round 2 merge).
export const AGENT_DESCRIPTION_TOTAL_LOCK = { chars: 592, measured: '2026-11-06' };
// The authored text of hooks/session-routing.md and hooks/session-rules.md, summed, which the session hook injects.
// This lock covers the authored text only; SESSION_START_BYTES_LOCK below locks the whole hook output.
// Set 1777 -> 1580 in the round 2 merge: dispatch-only rules left for hooks/dispatch-rules.md (-464),
// the confirm-before-undoable line came in from the now opt-in compression rule, and the done-rule clauses grew.
// Raised 1600 -> 1606 and 1739 -> 1745: "no reruns" became "no repeat loops", so a rerun after a fix stays allowed.
// Raised 1580 -> 1600 when the proof rule split into reuse-a-failing-check and one-run-per-variant bullets (same words, more arrows).
// Raised 1606 -> 1787 with the TaskStop rule line.
// Raised 1787 -> 1978 when the delete-would-unblock rule became the green-command-as-typed rule.
export const INJECTED_CONTEXT_LOCK = { bytes: 2727, measured: '2026-11-13' };
// Lines of hooks/**/*.mjs plus lib/hook-input.mjs, which run on every Bash call
// and session start; verify/checks/hook-budgets.mjs fails above it.
// Raised 1097 -> 1098 with the intake bound in dispatch-bash.mjs.
export const BRIEF_LINES_LOCK = { bytes: 1163, measured: '2026-11-11' };
export const HOOK_LINES_LOCK = { lines: 980, measured: '2026-11-11' };
export const HOOK_ENTRIES_LOCK = { entries: 8, measured: '2026-11-05' };
export const HOOK_TEXT_BYTES_LOCK = { bytes: 5936, measured: '2026-11-11' };
export const HOOK_WORK_LOCK = {
  measured: '2026-11-10',
  scripts: {
    'session-start.mjs': { modules: 28, reads: 9 },
    'dispatch-bash.mjs': { modules: 43, reads: 5 },
    'agent-effort.mjs': { modules: 46, reads: 45 },
    'dispatch-edit.mjs': { modules: 51, reads: 8 },
    'context-limit.mjs': { modules: 34, reads: 5 },
    'run-no-wait.mjs': { modules: 19, reads: 3 },
    'session-end.mjs': { modules: 13, reads: 2 }
  }
};
// Words every session loads before the first prompt: the session-start output,
// each model-invocable skill's name and description, each agent's name and
// description; verify/checks/hook-budgets.mjs fails above it.
// Lowered 909 -> 635 in the round 2 merge: dispatch-only rules moved to the Agent hook, compression rule
// text became the opt-in exo:short style, agent descriptions shortened; done-rule clauses added words back.
// Raised 636 -> 667 with the TaskStop rule line.
// Raised 667 -> 669 with the context limit on the settings line.
// Raised 669 -> 703 with the green-command-as-typed rule.
export const SESSION_LOAD_LOCK = { words: 850, measured: '2026-11-13' };
// Bytes of the whole additionalContext hooks/session-start.mjs injects (pointers, settings line with
// its compression rule text, routing and rules text), measured in an empty home and folder;
// verify/checks/hook-budgets.mjs fails above it.
// Lowered 3011 -> 1719 in the round 2 merge: dispatch-only rules delivered at the first Agent call, compression
// off by default so no rule text rides the settings line; done-rule clauses added bytes back.
// Raised 1719 -> 1739 with the proof-rule split above.
// Raised 1745 -> 1926 with the TaskStop rule line.
// Raised 1926 -> 1950 with the context limit on the settings line.
// Raised 1950 -> 2141 with the green-command-as-typed rule.
export const SESSION_START_BYTES_LOCK = { bytes: 2729, measured: '2026-11-13' };
// Skill size. Tokens are the body's bytes after the frontmatter divided by
// BYTES_PER_TOKEN, the sizing convention for skill text. The ceiling fails; realistic is the aim edit-skills
// states and the checks name in their PASS detail.
export const BYTES_PER_TOKEN = 4;
export const SKILL_BODY_TOKENS = { realistic: 2000, ceiling: 2500 };
// The six stage-path skills, capped at 750 tokens each. spec sits above the
// cap because its pinned gate sentences hold it at its measured 790.
export const STAGE_BODY_TOKENS = {
  'spec': 935, 'build': 1360, 'gate': 750, 'find-cause': 746, 'ship': 750,
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
  'skills/build/references/color.md': 764,
  'skills/build/references/design-ui.md': 1913,
  'skills/build/references/improve.md': 1598,
  'skills/build/references/layout.md': 984,
  'skills/build/references/marketing.md': 908,
  'skills/build/references/refactor.md': 853,
  'skills/build/references/typography.md': 968,
  'skills/ship/references/fields.md': 1293,
  'skills/build/references/critique.md': 798,
  'skills/build/references/data-migration.md': 874,
  'skills/build/references/security.md': 1028,
  'skills/build/references/test-design.md': 921,
  'skills/build/references/wave-worktrees.md': 954,
  'skills/build/run-task-prompt.md': 801,
  'skills/ship/references/pr-prep.md': 841,
  'skills/spec/references/brief.md': 994,
  'skills/spec/references/task-list.md': 1165,
  'skills/spec/references/worker-modes.md': 1534,
};
// lib/references/lean.md, read before every code edit, sits
// under the 750 tokens REFERENCE_TOKEN_LOCKS starts at, so it is locked in
// bytes, the same two ways: growth fails and so does a shrink the lock does
// not follow.
export const LEAN_REFERENCE_LOCK = { bytes: 1510, measured: '2026-11-11' };
export const DESCRIPTION_CHARS = { realistic: 200, ceiling: 250 };
export const DESCRIPTION_TOTAL_WARN = { chars: 5175 };
export const REFERENCE_CONTENTS_LINES = 100;
export const PRINCIPLE_PAGE_TOKENS = 800;
export const PRINCIPLE_INDEX_TOKENS = 300;

export const SCRIPT_OUTPUT_EXEMPT = ['skills/build/scripts/remove-worktree.mjs'];
// Bytes of each tracked .mjs file outside tests/; verify/checks/module-size.mjs fails above it.
// A file already over it is held at its measured size in verify/module-size-ceilings.txt, a list that only shrinks.
export const MODULE_FILE_CAP = { bytes: 8 * 1024 };

export const LOADED_PROSE_LOCK = { bytes: 317520 };
export const LOADED_PROSE_ROOTS = ['skills', 'agents', 'hooks', 'lib/references', 'lib/agent-modes', 'output-styles'];

export const SIZE_CAPS = { files: 1101, checkModules: 40, testFiles: 304, skillScripts: 248, evalCases: 20 };
