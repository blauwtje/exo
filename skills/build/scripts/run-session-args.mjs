import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './run-session-paths.mjs';
import { DENY_RULES, SESSION_RULES } from './run-session-rules.mjs';

const SESSION_TOOLS = { build: 'Read,Edit,Write,Bash,Grep,Glob', fix: 'Read,Edit,Write,Bash,Grep,Glob', review: 'Read,Write,Glob,Grep,Bash' };

const SESSION_AGENTS = { build: 'build-task', fix: 'build-task', review: 'review-branch' };

export function agentMaxTurns(kind, pluginRoot = PLUGIN_ROOT) {
  const text = fs.readFileSync(path.join(pluginRoot, 'agents', `${SESSION_AGENTS[kind]}.md`), 'utf8');
  const turns = Number(/^maxTurns:\s*(\d+)\s*$/m.exec(text)?.[1]);
  if (!Number.isInteger(turns) || turns < 1) throw new Error(`agents/${SESSION_AGENTS[kind]}.md has no maxTurns`);
  return turns;
}

const STALL_HOOK = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: `node "${path.join(PLUGIN_ROOT, 'hooks', 'run-stall-guard.mjs')}"` }] }] } };

function withStallGuard(settings) {
  if (settings === null) return STALL_HOOK;
  return { ...(typeof settings === 'string' ? JSON.parse(settings) : settings), ...STALL_HOOK };
}

export function claudeArgs({ model, effort, budget, allow, settings: base = null, kind = 'build', pluginDir = null, stallGuard = false, resume = null, taskCount = 1, deny = DENY_RULES }) {
  const settings = stallGuard ? withStallGuard(base) : base;
  return [
    '-p', ...(resume === null ? [] : ['--resume', resume]),
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--output-format', 'stream-json', '--verbose',
    ...(model === null ? [] : ['--model', model]),
    ...(effort === null ? [] : ['--effort', effort]),
    ...(budget === undefined ? [] : ['--max-budget-usd', budget]),
    ...(settings === null ? [] : ['--settings', typeof settings === 'string' ? settings : JSON.stringify(settings)]),
    '--strict-mcp-config',
    '--tools', SESSION_TOOLS[kind], '--disable-slash-commands',
    '--include-hook-events',
    '--append-system-prompt', SESSION_RULES,
    '--exclude-dynamic-system-prompt-sections',
    '--max-turns', String(agentMaxTurns(kind) * (kind === 'build' ? taskCount : 1)),
    ...(pluginDir === null ? [] : ['--plugin-dir', pluginDir]),
    '--allowedTools', ...allow,
    '--disallowedTools', ...deny, 'mcp__*'
  ];
}
