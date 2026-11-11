import { pooledSd } from '../../../lib/eval-stats.mjs';
import { planHoldout } from '../../../lib/holdout.mjs';
import { runCheck } from '../../../lib/run-check.mjs';
import { addRun, emptySamples, improveDefaults, readItems, readRun, readScore, scoreEnv } from './round.mjs';

const BASELINE_TIMEOUT_MS = 3_600_000;

export class SetupError extends Error {}

function baselineRun(cwd, cfg) {
  const { command, regex } = cfg;
  const started = Date.now();
  const run = runCheck(cwd, command, { timeoutMs: BASELINE_TIMEOUT_MS, env: scoreEnv(cfg), fresh: true, record: false });
  const score = readScore(run.output, regex);
  if (run.code !== 0 || run.timedOut || score === null) throw new SetupError(`score command failed on the baseline run: ${run.output.slice(-300)}`);
  return { output: run.output, seconds: (Date.now() - started) / 1000 };
}

export function baselineSamples(cwd, cfg) {
  const runs = Array.from({ length: improveDefaults().baselineRuns }, () => baselineRun(cwd, cfg));
  const holdout = planHoldout(runs.flatMap((run) => Object.keys(readItems(run.output))), improveDefaults());
  const samples = emptySamples();
  for (const run of runs) {
    const scored = readRun(run.output, { ...cfg, holdout });
    if (scored.score === null) throw new SetupError('baseline run printed no ITEM line for the tuning cases; print one ITEM <id> <number> line per case on every run');
    addRun(samples, scored);
  }
  return { samples, holdout, seconds: Math.max(...runs.map((run) => run.seconds)) };
}

const round4 = (value) => (value === null ? null : Number(value.toFixed(4)));

export function baselineNoise(samples, defaults = improveDefaults()) {
  const sd = pooledSd([samples.runs]);
  const items = Object.values(samples.items ?? {}).filter((values) => values.length > 0);
  const paired = items.length >= 2;
  const spread = paired ? pooledSd(items) : sd;
  if (spread === null) return { sd: round4(sd), mde: null };
  const se = spread * Math.sqrt(1 / samples.runs.length + 1 / defaults.maxRuns) / Math.sqrt(paired ? items.length : 1);
  return { sd: round4(sd), mde: round4(defaults.keepFloor + defaults.keepZ * se) };
}
