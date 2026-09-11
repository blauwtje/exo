#!/usr/bin/env node
// benchmarks/score.mjs
// Rescores a runs directory offline and prints one table; never reads a
// transcript, never calls claude. Tokens are weighted exactly as the savings
// counter weights them (token-weights.mjs); cost is total_cost_usd and time
// duration_ms as `claude -p --output-format json` reports them.
//
//   node benchmarks/score.mjs benchmarks/runs/<dir>
//   node benchmarks/score.mjs benchmarks/runs/<dir> --publish [--results <file>] [--ratios <file>]

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { sumCounts, usageCounts } from '../skills/savings/scripts/token-weights.mjs';
import { ROOT } from './tasks.mjs';

const METRICS = ['loc', 'tokens', 'cost', 'time'];
const RATIO_CAP = 0.95;
const RATIOS_HEADER = '// Data, not code: the cut per metric a benchmark measured against a no-skill\n'
  + '// baseline, and its source. A .mjs file because the verifier allows only\n'
  + '// modules under scripts/; benchmarks/score.mjs --publish rewrites it.\n';
const LIMITATIONS = [
  'Correctness on template tasks is a marker (a new route decorator, or a new .tsx file) plus python3 -m py_compile; TSX is not type-checked and no test suite runs.',
  'A cell that fails its correctness gate or times out is excluded from the LOC, tokens, cost and time means and counted in the correct column.',
  'Safe means the one adversarial input set in benchmarks/safe/<task>/check.mjs was refused; it is not a fuzzing guarantee.',
  'Tokens = input + 0.1 × cache read + 1.25 × 5-minute cache write + 2 × 1-hour cache write + output, from the usage block of the result JSON; cost is Claude Code\'s client-side list-price estimate; time is duration_ms.',
  'Spread is the sample standard deviation over the included cells; percentages divide arm means by the baseline mean.'
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
    const [task, arm] = path.dirname(file).split(path.sep);
    cells.push({ task, arm, checks, result });
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

function meanAndSd(values) {
  if (values.length === 0) return { mean: null, sd: null, n: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) return { mean, sd: 0, n: 1 };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return { mean, sd: Math.sqrt(variance), n: values.length };
}

function summarizeArm(cells) {
  const measured = cells.filter(included).map(cellMetrics);
  const summary = {};
  for (const metric of METRICS) summary[metric] = meanAndSd(measured.map((row) => row[metric]));
  const template = cells.filter((cell) => cell.checks.tier === 'template');
  const safe = cells.filter((cell) => cell.checks.tier === 'safe');
  summary.correct = { pass: template.filter((cell) => cell.checks.correct === true).length, total: template.length };
  summary.safe = { pass: safe.filter((cell) => cell.checks.safe === true).length, total: safe.length };
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

function tableLines(meta, summaries) {
  const header = `model ${meta.model} · Claude Code ${meta.claudeVersion} · fixture ${meta.fixture.name}@${meta.fixture.commit} · n=${meta.runs} · ${meta.date}`;
  const lines = [header, '', '| arm | LOC | tokens | cost | time | safe | correct |', '|---|---|---|---|---|---|---|'];
  const baseline = summaries.baseline;
  for (const [arm, summary] of Object.entries(summaries)) {
    const cells = METRICS.map((metric) => (arm === 'baseline' || !baseline ? absolute(metric, summary[metric]) : relative(summary[metric], baseline[metric])));
    lines.push(`| ${arm} | ${cells.join(' | ')} | ${rate(summary.safe)} | ${rate(summary.correct)} |`);
  }
  return lines;
}

function ratiosFrom(summaries, meta, resultsFile) {
  const baseline = summaries.baseline;
  const exo = summaries.exo;
  if (!baseline || !exo) throw new Error('--publish needs both a baseline and an exo arm');
  const ratios = {};
  const keys = { lines: 'loc', tokens: 'tokens', cost: 'cost', time: 'time' };
  for (const [name, metric] of Object.entries(keys)) {
    const cut = 1 - exo[metric].mean / baseline[metric].mean;
    ratios[name] = Math.round(Math.min(Math.max(cut, 0), RATIO_CAP) * 100) / 100;
  }
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
