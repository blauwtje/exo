import path from 'node:path';
import process from 'node:process';
import { commonDir } from '#checkout';
import { realpathOr, SCRIPTS_DIR } from './run-session-paths.mjs';

const SESSION_MARKERS = [
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_SESSION_ID'
];

export const SESSION_REFUSAL = 'exo run starts headless claude -p sessions and runs only from a terminal, not inside a Claude Code session; in the session run /exo:build <plan>, which builds with subagents';
export const insideClaudeCode = (env = process.env) => Boolean(env.CLAUDECODE);

const SESSION_GIT_HOOKS = path.join(SCRIPTS_DIR, 'session-git-hooks');

function refusingCommits(env, root) {
  const count = Number(env.GIT_CONFIG_COUNT) || 0;
  const common = commonDir(root) ?? '';
  return {
    ...env,
    EXO_RUN_GIT_DIR: realpathOr(common),
    GIT_CONFIG_COUNT: String(count + 1),
    [`GIT_CONFIG_KEY_${count}`]: 'core.hooksPath',
    [`GIT_CONFIG_VALUE_${count}`]: SESSION_GIT_HOOKS
  };
}

export function childEnv(pin, provider, { handoff = null, ecosystemEnv = {}, repair = false, refuseCommits = null } = {}) {
  const env = { ...process.env };
  for (const name of SESSION_MARKERS) delete env[name];
  for (const name of ['EXO_RUN_TASK', 'EXO_RUN_HANDOFF', 'EXO_RUN_REPAIR', 'EXO_RUN_SESSION']) delete env[name];
  env.EXO_RUN_SESSION = '1';
  if (repair) env.EXO_RUN_REPAIR = '1';
  if (pin !== null) env.EXO_RUN_TASK = pin;
  if (handoff !== null) env.EXO_RUN_HANDOFF = handoff;
  if (provider.name !== 'claude') delete env.ANTHROPIC_API_KEY;
  if (provider.name === 'claude' && provider.promptCacheTtl === '5m') env.FORCE_PROMPT_CACHING_5M = '1';
  if (provider.name === 'claude' && provider.promptCacheTtl === '1h') delete env.FORCE_PROMPT_CACHING_5M;
  const merged = { ...ecosystemEnv, ...env, ...provider.env, ...(provider.explicitEffort === true ? { CLAUDE_CODE_EFFORT_LEVEL: provider.effort } : {}) };
  return refuseCommits === null ? merged : refusingCommits(merged, refuseCommits);
}
