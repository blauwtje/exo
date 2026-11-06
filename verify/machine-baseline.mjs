import { spawnSync } from 'node:child_process';

export const BARE_NODE_ARGS = ['-e', '0'];
const WARMUP_ROUNDS = 1;
const TIMED_ROUNDS = 7;

export function elapsedMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

export function timedSpawn(args, { env, input, cwd }) {
  const started = elapsedMs();
  const run = spawnSync(process.execPath, args, { env, input, encoding: 'utf8', cwd });
  const elapsed = elapsedMs() - started;
  return run.status === 0 ? elapsed : null;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function spawnOverhead(script, { spawn = timedSpawn, rounds = TIMED_ROUNDS, ...options }) {
  const hook = [];
  const bare = [];
  for (let round = 0; round < WARMUP_ROUNDS + rounds; round += 1) {
    const hookMs = spawn([script], options);
    const bareMs = spawn(BARE_NODE_ARGS, options);
    if (hookMs === null || bareMs === null) return null;
    if (round < WARMUP_ROUNDS) continue;
    hook.push(hookMs);
    bare.push(bareMs);
  }
  const hookMedian = median(hook);
  const bareMedian = median(bare);
  return { overhead: hookMedian - bareMedian, hook: hookMedian, bare: bareMedian, rounds };
}
