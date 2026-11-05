import fs from 'node:fs';
import path from 'node:path';

const ARMS = 2;

export function recordRun(grade, { cost, durationMs }) {
  return { ...grade, durationMs, cost_usd: cost };
}

export function recordedRuns(outDir) {
  const file = path.join(outDir, 'grades.json');
  if (!fs.existsSync(file)) return [];
  return Object.values(JSON.parse(fs.readFileSync(file, 'utf8'))).flatMap((cell) => cell.runs);
}

function medianCost(recorded) {
  const costs = recorded.map((run) => run.cost_usd).filter((cost) => typeof cost === 'number').sort((left, right) => left - right);
  if (costs.length === 0) return null;
  const middle = Math.floor(costs.length / 2);
  return costs.length % 2 ? costs[middle] : (costs[middle - 1] + costs[middle]) / 2;
}

export function dryRunReport({ cells, runs, judgeLines, votes }, recorded) {
  const sessions = cells.length * ARMS * runs;
  const median = medianCost(recorded);
  const spend = median === null ? ', cost unknown' : ` x median $${median.toFixed(4)} = $${(sessions * median).toFixed(2)}`;
  const judgeCalls = sessions * judgeLines * votes;
  return `dry-run: ${sessions} sessions${spend}; judge calls: ${judgeCalls} (at most, a run whose deterministic line fails skips them)`;
}
