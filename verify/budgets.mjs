
export const EXPECTED_SKILLS = [
  'find-cause', 'save-session', 'build', 'gate', 'configure', 'spec', 'ship', 'edit-skills', 'write-docs', 'watch'
];

export const EXPECTED_SKILL_PATHS = EXPECTED_SKILLS.map((name) => `skills/${name}/SKILL.md`);

export const ALLOWED_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];
export const ALLOWED_MODEL = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'];

export const INJECTED_CONTEXT_LOCK = { bytes: 2727, measured: '2026-11-13' };
export const BRIEF_LINES_LOCK = { bytes: 1163, measured: '2026-11-11' };
export const HOOK_LINES_LOCK = { lines: 980, measured: '2026-11-11' };
export const HOOK_ENTRIES_LOCK = { entries: 7, measured: '2026-11-14' };
export const HOOK_TEXT_BYTES_LOCK = { bytes: 5936, measured: '2026-11-11' };
export const HOOK_WORK_LOCK = {
  measured: '2026-11-10',
  scripts: {
    'session-start.mjs': { modules: 28, reads: 9 },
    'dispatch-bash.mjs': { modules: 43, reads: 5 },
    'agent-effort.mjs': { modules: 46, reads: 45 },
    'context-limit.mjs': { modules: 34, reads: 5 },
    'run-no-wait.mjs': { modules: 19, reads: 3 },
    'session-end.mjs': { modules: 13, reads: 2 }
  }
};
export const SESSION_LOAD_LOCK = { words: 850, measured: '2026-11-13' };
export const SESSION_START_BYTES_LOCK = { bytes: 2729, measured: '2026-11-13' };
export const BYTES_PER_TOKEN = 4;
export const SKILL_BODY_TOKENS = { ceiling: 2500 };
export const STAGE_BODY_TOKENS = {
  'spec': 935, 'build': 1360, 'gate': 750, 'find-cause': 746, 'ship': 750,
};
export const AGENT_BODY_TOKENS = { ceiling: 750 };

export const SCRIPT_OUTPUT_EXEMPT = ['skills/build/scripts/remove-worktree.mjs'];

export const SIZE_CAPS = { files: 1101, checkModules: 40, testFiles: 304, skillScripts: 248, evalCases: 20 };
