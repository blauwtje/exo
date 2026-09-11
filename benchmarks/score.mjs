#!/usr/bin/env node
// benchmarks/score.mjs
// Rescores a runs directory offline and prints one table; never reads a
// transcript, never calls claude. Tokens are weighted exactly as the savings
// counter weights them (token-weights.mjs); cost is total_cost_usd and time
// duration_ms as `claude -p --output-format json` reports them. The
// right-sizing column reads each cell's own ledger.
//
//   node benchmarks/score.mjs benchmarks/runs/<dir>
//   node benchmarks/score.mjs benchmarks/runs/<dir> --publish [--results <file>] [--ratios <file>]

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readJson } from '../skills/savings/scripts/ledger.mjs';
import { sumCounts, usageCounts } from '../skills/savings/scripts/token-weights.mjs';
import { meanAndSd } from './statistics.mjs';
import { ROOT } from './tasks.mjs';

const METRICS = ['loc', 'tokens', 'cost', 'time'];
// A cut at or above 1 would divide the saving estimate by zero.
const RATIO_CAP = 0.95;
const RATIOS_HEADER = '// Data, not code: the cut per metric a benchmark measured against a no-skill\n'
  + '// baseline, the standard error of each cut, and its source. A .mjs file because\n'
  + '// the verifier allows only modules under scripts/; benchmarks/score.mjs --publish rewrites it.\n';
const LIMITATIONS = [
  'Correctness on template tasks is a marker (a new route decorator, or a new .tsx file) plus python3 -m py_compile; TSX is not type-checked and no test suite runs.',
  'A cell that fails its correctness gate or times out is excluded from the LOC, tokens, cost and time means and counted in the correct column.',
  'Safe means the one adversarial input set in benchmarks/safe/<task>/check.mjs was refused; it is not a fuzzing guarantee.',
  'Tokens = input + 0.1 × cache read + 1.25 × 5-minute cache write + 2 × 1-hour cache write + output, from the usage block of the result JSON; cost is Claude Code\'s client-side list-price estimate; time is duration_ms.',
  'Spread is the sample standard deviation over the included cells; percentages divide arm means by the baseline mean.',
  'A published ratio is 1 − E/B for arm means E and B, and its spread is its standard error √(sd_E²/n_E + (E/B)²·sd_B²/n_B) / B; a negative ratio means the exo arm used more than the baseline.',
  'Right-sizing counts the template cells whose own ledger shows exo:right-sizing fired.'
];

function parseArguments(argv) {
  const options = { directory: null, publish: false, results: null, ratios: path.join(ROOT, 'skills', 'savings', 'scripts', 'ratios.mjs') };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--publish') options.publish = true;
    else if (flag === '--results') options.results = argv[++index];
    else if (flag === '--ratios') options.ratios = argv[++index];
    else if (options.directory === null) options.directory = path.resolve(flag);
    else throw new Error(`unknown argument ${flag}`);
  }
  if (options.directory === null) throw new Error('usage: score.mjs <runs directory> [--publish] [--results <file>] [--ratios <file>]');
  return options;
}

function readCells(directory) {
  const cells = [];
  for (const file of fs.readdirSync(directory, { recursive: true })) {
    if (path.basename(file) !== 'checks.json') continue;
    const cellDirectory = path.join(directory, path.dirname(file));
    const checks = JSON.parse(fs.readFileSync(path.join(cellDirectory, 'checks.json'), 'utf8'));
    const resultFile = path.join(cellDirectory, 'result.json');
    const result = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : null;
    const ledger = readJson(path.join(cellDirectory, 'ledger', 'sessions.json'), {});
    const rightSized = Object.values(ledger).some((session) => session.rightSized === true);
    const [task, arm] = path.dirname(file).split(path.sep);
    cells.push({ task, arm, checks, result, rightSized });
  }
  return cells;
}

function cellMetrics(cell) {
  const counts = sumCounts([usageCounts(cell.result.usage ?? {})]);
  return {
    loc: cell.checks.loc.added,
    tokens: counts.weightedInput + counts.output,
    cost: cell.result.total_cost_usd,
    time: cell.result.duration_ms
  };
}

function included(cell) {
  return cell.checks.tier === 'template' && cell.checks.correct === true && !cell.checks.timedOut && cell.result !== null;
}

function summarizeArm(cells) {
  const measured = cells.filter(included).map(cellMetrics);
  const summary = {};
  for (const metric of METRICS) summary[metric] = meanAndSd(measured.map((row) => row[metric]));
  const template = cells.filter((cell) => cell.checks.tier === 'template');
  const safe = cells.filter((cell) => cell.checks.tier === 'safe');
  summary.correct = { pass: template.filter((cell) => cell.checks.correct === true).length, total: template.length };
  summary.safe = { pass: safe.filter((cell) => cell.checks.safe === true).length, total: safe.length };
  summary.rightSized = { pass: template.filter((cell) => cell.rightSized).length, total: template.length };
  return summary;
}

function compact(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e4) return `${Math.round(value / 1e3)}k`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function minutes(milliseconds) {
  return `${(milliseconds / 60000).toFixed(1)}m`;
}

const FORMAT = {
  loc: (value) => compact(value),
  tokens: (value) => compact(value),
  cost: (value) => `$${value.toFixed(2)}`,
  time: (value) => minutes(value)
};

function absolute(metric, stat) {
  if (stat.mean === null) return '-';
  const spread = metric === 'cost' ? stat.sd.toFixed(2) : FORMAT[metric](stat.sd);
  return `${FORMAT[metric](stat.mean)} ±${spread}`;
}

function relative(stat, baseline) {
  if (stat.mean === null || baseline.mean === null || baseline.mean === 0) return '-';
  return `${Math.round((stat.mean / baseline.mean - 1) * 100)}%`;
}

function rate({ pass, total }) {
  if (total === 0) return '-';
  return `${Math.round((pass / total) * 100)}% (${pass}/${total})`;
}

// Every arm shows its mean and spread; an arm beside a baseline adds its change against it.
function tableLines(meta, summaries) {
  const header = `model ${meta.model} · Claude Code ${meta.claudeVersion} · fixture ${meta.fixture.name}@${meta.fixture.commit} · n=${meta.runs} · ${meta.date}`;
  const lines = [header, '', '| arm | LOC | tokens | cost | time | safe | correct | right-sizing |', '|---|---|---|---|---|---|---|---|'];
  const baseline = summaries.baseline;
  for (const [arm, summary] of Object.entries(summaries)) {
    const cells = METRICS.map((metric) => {
      const value = absolute(metric, summary[metric]);
      return arm === 'baseline' || !baseline ? value : `${value} (${relative(summary[metric], baseline[metric])})`;
    });
    lines.push(`| ${arm} | ${cells.join(' | ')} | ${rate(summary.safe)} | ${rate(summary.correct)} | ${rate(summary.rightSized)} |`);
  }
  return lines;
}

function roundedCent(value) {
  return Math.round(value * 100) / 100;
}

// The standard error of 1 − E/B, from the standard errors of both arm means.
function cutError(exo, baseline) {
  const exoVariance = exo.sd ** 2 / exo.n;
  const baselineVariance = (exo.mean / baseline.mean) ** 2 * baseline.sd ** 2 / baseline.n;
  return Math.sqrt(exoVariance + baselineVariance) / baseline.mean;
}

// A negative cut is a measured cost of exo, so it is never floored at zero.
function ratiosFrom(summaries, meta, resultsFile) {
  const baseline = summaries.baseline;
  const exo = summaries.exo;
  if (!baseline || !exo) throw new Error('--publish needs both a baseline and an exo arm');
  const ratios = {};
  const spread = {};
  const keys = { lines: 'loc', tokens: 'tokens', cost: 'cost', time: 'time' };
  for (const [name, metric] of Object.entries(keys)) {
    if (exo[metric].mean === null || baseline[metric].mean === null) throw new Error(`--publish needs correct template cells in both arms for ${metric}`);
    ratios[name] = roundedCent(Math.min(1 - exo[metric].mean / baseline[metric].mean, RATIO_CAP));
    spread[name] = roundedCent(cutError(exo[metric], baseline[metric]));
  }
  ratios.spread = spread;
  const taskCount = new Set(meta.tasks).size;
  ratios.source = `${path.basename(resultsFile)}: exo vs baseline, ${taskCount} tasks, ${meta.model}, n=${meta.runs}, ${meta.date}`;
  return ratios;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const meta = JSON.parse(fs.readFileSync(path.join(options.directory, 'meta.json'), 'utf8'));
  const cells = readCells(options.directory);
  const byArm = {};
  for (const arm of meta.arms) byArm[arm] = cells.filter((cell) => cell.arm === arm);
  const summaries = {};
  for (const [arm, armCells] of Object.entries(byArm)) summaries[arm] = summarizeArm(armCells);
  const lines = tableLines(meta, summaries);
  process.stdout.write(`${lines.join('\n')}\n`);
  if (!options.publish) return;
  const resultsFile = options.results ?? path.join(ROOT, 'benchmarks', 'results', `${meta.date}.md`);
  const ratios = ratiosFrom(summaries, meta, resultsFile);
  const document = [
    `# Benchmark ${meta.date}`,
    '',
    `Arms against a no-skill baseline on ${meta.tasks.length} tasks (${meta.cells} cells, ${meta.mode} configuration). Raw cells live under benchmarks/runs/ and are git-ignored; this file is what \`node benchmarks/score.mjs\` printed.`,
    '',
    ...lines,
    '',
    `Ratios published to skills/savings/scripts/ratios.mjs: ${JSON.stringify(ratios)}`,
    '',
    '## Limitations',
    '',
    ...LIMITATIONS.map((line) => `- ${line}`),
    ''
  ];
  fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
  fs.writeFileSync(resultsFile, document.join('\n'));
  fs.writeFileSync(options.ratios, `${RATIOS_HEADER}export default ${JSON.stringify(ratios, null, 2)};\n`);
  process.stdout.write(`\npublished ${resultsFile} and ${options.ratios}\n${JSON.stringify(ratios)}\n`);
}

try {
  main();
} catch (error) {
  console.error(`score: ${error.message}`);
  process.exit(1);
}
