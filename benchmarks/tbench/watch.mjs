#!/usr/bin/env node
import os from 'node:os';
import process from 'node:process';
import { loadRunConfig } from '../../skills/build/scripts/run-config.mjs';
import { environmentMs } from '../../lib/script-flags.mjs';
import { readTrials, trialCost } from './job.mjs';

const tbenchDefaults = () => loadRunConfig({ home: os.homedir() }).defaults.tbench;

export function projectedSpend(jobDirectories, trialUsd = tbenchDefaults().trialUsd) {
  let finished = 0;
  let running = 0;
  let projected = 0;
  for (const directory of jobDirectories) {
    const trials = readTrials(directory);
    const costs = trials.filter((trial) => trial.result).map((trial) => trialCost(trial) ?? 0);
    const charge = costs.length > 0 ? Math.max(...costs) : trialUsd;
    const open = trials.length - costs.length;
    const spent = costs.reduce((sum, cost) => sum + cost, 0);
    finished += spent;
    running += open;
    projected += spent + open * charge;
  }
  return { finished, running, projected };
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function watch({
  jobs, pid, limit = tbenchDefaults().limitUsd, trialUsd = tbenchDefaults().trialUsd, rounds = 200, intervalMs = environmentMs('EXO_TBENCH_POLL_MS', 30000),
  kill = process.kill, alive = isAlive, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = () => {}
}) {
  for (let round = 1; round <= rounds; round += 1) {
    const spend = projectedSpend(jobs, trialUsd);
    log(`round ${round}: finished $${spend.finished.toFixed(2)} + ${spend.running} running = $${spend.projected.toFixed(2)} of $${limit}`);
    if (spend.projected >= limit) {
      kill(pid, 'SIGTERM');
      return { status: 'cancelled', round, ...spend };
    }
    if (!alive(pid)) return { status: 'done', round, ...spend };
    await sleep(intervalMs);
  }
  return { status: 'rounds', round: rounds, ...projectedSpend(jobs, trialUsd) };
}

function parse(argv) {
  const options = { jobs: [], pid: null, rounds: 200 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    if (flag === '--job') options.jobs.push(value());
    else if (flag === '--pid') options.pid = Number(value());
    else if (flag === '--limit') options.limit = Number(value());
    else if (flag === '--running') options.trialUsd = Number(value());
    else if (flag === '--interval') options.intervalMs = Number(value()) * 1000;
    else if (flag === '--rounds') options.rounds = Number(value());
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!Number.isInteger(options.pid) || options.jobs.length === 0) {
    throw new Error('usage: watch.mjs --pid <harbor pid> --job <job dir> [--job ...] [--limit <usd>] [--running <usd>] [--interval <s>] [--rounds 200]');
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await watch({ ...parse(process.argv.slice(2)), log: (line) => process.stdout.write(`${line}\n`) });
    process.stdout.write(`${result.status} at round ${result.round}: projected $${result.projected.toFixed(2)}\n`);
    process.exit({ done: 0, cancelled: 3, rounds: 2 }[result.status]);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
