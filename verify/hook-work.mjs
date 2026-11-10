import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PRELOAD = fileURLToPath(new URL('./hook-work-preload.mjs', import.meta.url));
const SCRUBBED_VARIABLES = ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'EXO_HOST', 'EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_SESSION'];
const SESSION_ID = 'hook-work';
const USAGE = { type: 'assistant', timestamp: '2026-01-01T00:00:00.000Z', message: { usage: { input_tokens: 20000, output_tokens: 10 } } };

export function scratchEnv(scratch) {
  const env = { ...process.env, HOME: scratch, USERPROFILE: scratch };
  for (const name of SCRUBBED_VARIABLES) delete env[name];
  return env;
}

const toolCall = (tool, toolInput) => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, session_id: SESSION_ID });

export const HOOK_INPUTS = {
  'session-start.mjs': () => ({ hook_event_name: 'SessionStart', source: 'startup', session_id: SESSION_ID }),
  'dispatch-bash.mjs': () => toolCall('Bash', { command: 'git status' }),
  'agent-effort.mjs': () => toolCall('Agent', { subagent_type: 'exo:lookup', prompt: 'Reads: none' }),
  'dispatch-edit.mjs': (scratch) => toolCall('Edit', { file_path: path.join(scratch, 'a.txt'), old_string: 'a', new_string: 'b' }),
  'context-limit.mjs': (scratch) => ({ ...toolCall('Read', { file_path: path.join(scratch, 'a.txt') }), transcript_path: path.join(scratch, 'session.jsonl') }),
  'run-no-wait.mjs': () => ({ hook_event_name: 'Stop', session_id: SESSION_ID }),
  'session-end.mjs': () => ({ hook_event_name: 'SessionEnd', session_id: SESSION_ID })
};

function prepare(scratch) {
  fs.writeFileSync(path.join(scratch, 'a.txt'), 'a\n');
  fs.writeFileSync(path.join(scratch, 'session.jsonl'), `${JSON.stringify(USAGE)}\n`);
}

export function countHookWork(script, name) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-hook-work-'));
  const output = path.join(scratch, 'work.json');
  prepare(scratch);
  const input = { ...HOOK_INPUTS[name](scratch), cwd: scratch };
  const env = { ...scratchEnv(scratch), EXO_HOOK_WORK_OUT: output };
  try {
    const run = spawnSync(process.execPath, ['--import', PRELOAD, script], { input: JSON.stringify(input), encoding: 'utf8', env, cwd: scratch });
    if (run.status !== 0 || !fs.existsSync(output)) return null;
    return JSON.parse(fs.readFileSync(output, 'utf8'));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
