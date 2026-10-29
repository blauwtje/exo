import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HOOK_SPAWN_MS_LOCK } from '../budgets.mjs';

const WARMUP_SPAWNS = 1;
const TIMED_SPAWNS = 7;
const SCRUBBED_VARIABLES = ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'EXO_HOST', 'EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_SESSION'];

function scratchEnv(scratch) {
  const env = { ...process.env, HOME: scratch, USERPROFILE: scratch };
  for (const name of SCRUBBED_VARIABLES) delete env[name];
  return env;
}

function spawnMilliseconds(script, scratch) {
  const input = JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'git status' },
    session_id: 'hook-latency',
    cwd: scratch
  });
  const started = performance.now();
  const run = spawnSync(process.execPath, [script], { env: scratchEnv(scratch), input, encoding: 'utf8', cwd: scratch });
  const elapsed = performance.now() - started;
  return run.status === 0 ? elapsed : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measureMedian(script) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-hook-latency-'));
  try {
    const runs = Array.from({ length: WARMUP_SPAWNS + TIMED_SPAWNS }, () => spawnMilliseconds(script, scratch)).slice(WARMUP_SPAWNS);
    return runs.includes(null) ? null : median(runs);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export function checkHookLatency(report, repository) {
  const script = repository.join('hooks', 'dispatch-bash.mjs');
  const milliseconds = fs.existsSync(script) ? measureMedian(script) : null;
  if (milliseconds === null) {
    report.result('FAIL', 'hook latency', 'hooks/dispatch-bash.mjs is missing or exited non-zero on a Bash input');
    return;
  }
  const detail = `${milliseconds.toFixed(1)} ms median per Bash hook spawn over ${TIMED_SPAWNS} runs against the ${HOOK_SPAWN_MS_LOCK.ms} ms locked on ${HOOK_SPAWN_MS_LOCK.measured}`;
  if (milliseconds > HOOK_SPAWN_MS_LOCK.ms) {
    report.result('FAIL', 'hook latency', `${detail}; cut work on the hook path (eager imports, file reads), or raise the lock in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  report.result('PASS', 'hook latency', detail);
}
