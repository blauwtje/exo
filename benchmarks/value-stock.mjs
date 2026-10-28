import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './tasks.mjs';

export function stockStorePath(root = ROOT) {
  const common = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return path.join(common, 'exo', 'value', 'stock.json');
}

export function readStock(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function stockRows({ cells, model, claudeVersion }) {
  const rows = new Map();
  for (const { task, pass, cost_usd: cost, wallMs } of cells) {
    if (typeof pass !== 'boolean' || typeof cost !== 'number') throw new Error(`stock baseline: ${task} has a cell without a pass verdict and a cost, so nothing is stored`);
    if (!rows.has(task)) rows.set(task, { task, model, claudeVersion, runs: [] });
    rows.get(task).runs.push({ pass, cost_usd: cost, wallMs });
  }
  return [...rows.values()];
}

export function mergeStock(existing, fresh) {
  const replaced = (row) => fresh.some((next) => next.task === row.task && next.model === row.model);
  return [...existing.filter((row) => !replaced(row)), ...fresh];
}

export function writeStock(file, fresh) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(mergeStock(readStock(file), fresh), null, 2)}\n`);
}

const mean = (numbers) => numbers.reduce((sum, number) => sum + number, 0) / numbers.length;

export function quickStock({ rows, tasks, model, claudeVersion }) {
  const missing = tasks.filter((task) => !rows.some((row) => row.task === task && row.model === model));
  if (missing.length > 0) throw new Error(`quick: no stock arm stored for ${missing.join(', ')} on ${model}; run node benchmarks/run.mjs --tier value --stock-baseline once`);
  const stock = rows.filter((row) => tasks.includes(row.task) && row.model === model);
  const stale = [...new Set(stock.map((row) => row.claudeVersion).filter((version) => version !== claudeVersion))];
  const warning = stale.length === 0 ? null : `quick: stock arm was stored on claude ${stale.join(', ')}, this run uses ${claudeVersion}; rerun --stock-baseline to refresh it`;
  return { stock, warning };
}

export function quickSummary({ stock, cells, durationMs }) {
  const tasks = stock.flatMap((row) => {
    const own = cells.filter((cell) => cell.task === row.task);
    if (own.length === 0) return [];
    const costs = own.map((cell) => cell.cost_usd).filter((cost) => typeof cost === 'number');
    const passRate = (runs) => runs.filter((run) => run.pass).length / runs.length;
    const stockCost = mean(row.runs.map((run) => run.cost_usd));
    const exoCost = costs.length === 0 ? null : mean(costs);
    return [{
      task: row.task, exoPass: passRate(own), stockPass: passRate(row.runs), passDelta: passRate(own) - passRate(row.runs),
      exoCost, stockCost, costDelta: exoCost === null ? null : exoCost - stockCost
    }];
  });
  const total = cells.map((cell) => cell.cost_usd).filter((cost) => typeof cost === 'number');
  return { mode: 'quick', cost_usd: total.reduce((sum, cost) => sum + cost, 0), durationMs, tasks };
}

export function modeSummary({ mode, cells, durationMs }) {
  const costs = cells.map((cell) => cell.cost_usd).filter((cost) => typeof cost === 'number');
  return { mode, cost_usd: costs.reduce((sum, cost) => sum + cost, 0), durationMs, cells: cells.length };
}
