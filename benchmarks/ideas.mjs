import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { confinedClaude } from '#confine-claude';
import { loadedSkillDirs, wrongCopies } from '#plugin-copy';
import { UsageError, environmentMs, isMain, parseFlags } from '#script-flags';
import { claudeJudge, compareMarkdown, resultsMarkdown, scoreArm } from './ideas-score.mjs';
import { makeCellHome } from './cell-home.mjs';
import { applyVariant } from './variants.mjs';
import { medianCost } from './routing.mjs';
import { copyPluginWithoutTasks } from './value.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CASES = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'ideas', 'cases.json'), 'utf8'));
const FIXTURES = '/tmp/exo-pressure/spec';
const SETUP = path.join(import.meta.dirname, 'pressure', 'spec', 'setup.sh');
const RUN_FILES = 'benchmarks/runs/<date>-ideas/<arm>/<case>/<i>/{stdout.json,final.md}';
const USAGE = 'usage: ideas.mjs [--arm base|<variant>] [--full] [--n <int>] [--cases <ids>] [--confirm] [--jobs <int>] [--out <dir>] | --score <dir> [--arm <name>] [--results <file>] [--baseline <dir>] | --compare <dir> <dir>; default one answer per case (quick), --full five; --baseline compares the scored arm to <dir>/base/records.json; each run writes ' + RUN_FILES + '/run.json';
const SPEC = { arm: 'value', full: 'boolean', baseline: 'value', n: 'value', cases: 'value', confirm: 'boolean', jobs: 'value', out: 'value', score: 'value', results: 'value' };
export const MAKER_LINE = 'Which designs could do this? Recommend one.';
export const HEADLESS_LINE = 'No one will answer questions; decide any open point yourself.';
const QUICK_N = 1;
const FULL_N = 5;

export function makerPrompt(feature) {
  return `/exo:spec ${feature} ${MAKER_LINE} ${HEADLESS_LINE}`;
}

export function plannedCells({ arm, n, caseIds, mode = 'quick' }) {
  return caseIds.flatMap((caseId) => Array.from({ length: n }, (_, index) => ({ arm, caseId, run: index + 1, mode })));
}

const today = () => new Date().toISOString().slice(0, 10);

function armCopy({ arm, scratch }) {
  const copy = copyPluginWithoutTasks(ROOT, path.join(scratch, 'plugin'));
  if (arm !== 'base') applyVariant(arm, copy, ROOT);
  return copy;
}

function resultOf(line) {
  try {
    const event = JSON.parse(line);
    return event.type === 'result' && typeof event.result === 'string' ? event.result : null;
  } catch {
    return null;
  }
}

function finalText(stdout) {
  return stdout.split('\n').reduce((text, line) => resultOf(line) ?? text, '');
}

// Tokens (input + output + cache creation + cache read) and cost of a run's result event. modelUsage sums every model including subagents; usage is the main session only, the fallback. Absent parts give null, never 0.
export function usageOf(stdout) {
  const result = stdout.split('\n').reduce((found, line) => {
    try {
      const event = JSON.parse(line);
      return event.type === 'result' ? event : found;
    } catch {
      return found;
    }
  }, null);
  const sum = (rows) => (rows.length > 0 && rows.every((row) => row.every(Number.isFinite)) ? rows.reduce((total, row) => total + row.reduce((a, c) => a + c, 0), 0) : null);
  const models = Object.values(result?.modelUsage ?? {});
  const fromModels = sum(models.map((m) => [m.inputTokens, m.outputTokens, m.cacheCreationInputTokens, m.cacheReadInputTokens]));
  const u = result?.usage;
  const fromUsage = u ? sum([[u.input_tokens, u.output_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens]]) : null;
  const cost = result?.total_cost_usd;
  return { tokens: fromModels ?? fromUsage, costUsd: Number.isFinite(cost) ? cost : null };
}

export function wrongCopyDirs(stdout, pluginDir) {
  const dirs = [];
  for (const line of stdout.split('\n')) {
    try {
      dirs.push(...loadedSkillDirs(JSON.parse(line)));
    } catch {
    }
  }
  return wrongCopies(dirs, pluginDir);
}

// why: user settings enable the installed plugins and HOME carries the global CLAUDE.md, so a maker run skips user settings and runs under a cell home, loading only the arm's copy.
export function makerArguments({ prompt, plugin, effort = 'high' }) {
  return ['-p', prompt, '--model', 'opus', '--effort', effort, '--output-format', 'stream-json', '--verbose', '--setting-sources', 'project,local', '--strict-mcp-config', '--plugin-dir', plugin];
}

function runClaude({ cell, plugin, scratch, home }) {
  const fixture = path.join(FIXTURES, CASES[cell.caseId].fixture);
  if (!fs.existsSync(fixture)) spawnSync('bash', [SETUP], { stdio: 'inherit' });
  const work = fs.mkdtempSync(path.join(scratch, 'work-'));
  const tmp = fs.mkdtempSync(path.join(scratch, 'tmp-'));
  fs.cpSync(fixture, work, { recursive: true });
  const prompt = makerPrompt(CASES[cell.caseId].feature);
  const run = confinedClaude({ args: makerArguments({ prompt, plugin, effort: process.env.EXO_IDEAS_EFFORT || undefined }), roots: [scratch], cwd: work, tmp });
  const timeoutMs = environmentMs('EXO_IDEAS_RUN_MS', 1_200_000);
  return new Promise((resolve) => {
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...process.env, HOME: home, ...run.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, signal, timedOut, timeoutMs });
    });
  });
}

// why: a crashed or cut-off maker run is no evidence about ideation, so it is recorded as failed and left out of every metric; a finished answer without options still scores 0.
export function runFailure({ stdout, exitCode, signal = null, timedOut = false, timeoutMs }) {
  if (timedOut) return `timed out after ${timeoutMs} ms`;
  if (exitCode !== 0) return exitCode === null ? `killed by ${signal}` : `exit code ${exitCode}`;
  if (finalText(stdout).trim() === '') return 'no final assistant text';
  return null;
}

async function runCells({ cells, out, jobs }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-ideas-'));
  const plugin = armCopy({ arm: cells[0].arm, scratch });
  try {
    await runEach({ cells, out, plugin, scratch, jobs });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

// why: each cell gets its own HOME, so cells running at once never share session state.
async function runEach({ cells, out, plugin, scratch, jobs = 1 }) {
  const queue = [...cells];
  const worker = async () => {
    for (let cell = queue.shift(); cell !== undefined; cell = queue.shift()) await runCell({ cell, out, plugin, scratch });
  };
  await Promise.all(Array.from({ length: Math.min(jobs, cells.length) }, worker));
}

async function runCell({ cell, out, plugin, scratch }) {
  const home = makeCellHome();
  try {
    const outcome = await runClaude({ cell, plugin, scratch, home });
    const folder = path.join(out, cell.arm, cell.caseId, String(cell.run));
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'stdout.json'), outcome.stdout);
    fs.writeFileSync(path.join(folder, 'stderr.log'), outcome.stderr);
    fs.writeFileSync(path.join(folder, 'run.json'), `${JSON.stringify({ arm: cell.arm, case: cell.caseId, run: cell.run, mode: cell.mode })}\n`);
    for (const name of ['final.md', 'failed.json']) fs.rmSync(path.join(folder, name), { force: true });
    const reason = runFailure(outcome);
    if (reason === null) fs.writeFileSync(path.join(folder, 'final.md'), finalText(outcome.stdout));
    else fs.writeFileSync(path.join(folder, 'failed.json'), `${JSON.stringify({ reason, exitCode: outcome.exitCode, signal: outcome.signal, timedOut: outcome.timedOut }, null, 2)}\n`);
    for (const wrong of wrongCopyDirs(outcome.stdout, plugin)) console.warn(`WRONG COPY ${cell.arm}/${cell.caseId}/${cell.run}: ${wrong} is not under ${plugin}`);
    console.log(`${reason === null ? 'done' : `FAILED (${reason})`} ${cell.arm}/${cell.caseId}/${cell.run}`);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function failureOf(runDir) {
  const file = path.join(runDir, 'failed.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).reason ?? 'failed';
  return fs.existsSync(path.join(runDir, 'final.md')) ? null : 'no final.md';
}

function readOrEmpty(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function readRuns(armDir) {
  const runsByCase = {};
  const failed = [];
  for (const caseId of fs.readdirSync(armDir).filter((name) => CASES[name])) {
    const caseDir = path.join(armDir, caseId);
    runsByCase[caseId] = [];
    for (const run of fs.readdirSync(caseDir).sort((a, b) => a - b)) {
      const reason = failureOf(path.join(caseDir, run));
      if (reason === null) runsByCase[caseId].push({ run: Number(run), finalText: fs.readFileSync(path.join(caseDir, run, 'final.md'), 'utf8'), ...usageOf(readOrEmpty(path.join(caseDir, run, 'stdout.json'))) });
      else failed.push(`${caseId}/${run} (${reason})`);
    }
  }
  return { runsByCase, failed };
}

// why: benchmarks/runs/ is gitignored, so the maker answers behind a results file were lost and a later judge or rubric could not rescore them; the raw runs and their scored records are kept beside the results file.
export function rawRecordsFile(resultsFile) {
  return resultsFile.replace(/\.md$/, '') + '.records.json';
}

export function rawRecordsJson({ arm, runsByCase, records }) {
  const runs = Object.entries(runsByCase).flatMap(([caseId, list]) => list.map(({ run, finalText, tokens, costUsd }) => ({ case: caseId, run, finalText, tokens, costUsd })));
  return `${JSON.stringify({ arm, runs, records }, null, 2)}\n`;
}

export async function scoreDirectory({ dir, arm, judge, results }) {
  const armDir = path.join(dir, arm);
  const { runsByCase, failed } = readRuns(armDir);
  const scored = await scoreArm({ judge, cases: CASES, runsByCase });
  fs.writeFileSync(path.join(armDir, 'records.json'), JSON.stringify(scored.records, null, 2));
  const file = results ?? path.join(ROOT, 'benchmarks', 'results', `${today()}-ideas-${arm}.md`);
  fs.writeFileSync(file, resultsMarkdown({ arm, ...scored, failed }));
  fs.writeFileSync(rawRecordsFile(file), rawRecordsJson({ arm, runsByCase, records: scored.records }));
  return file;
}

function compareDirectories([left, right]) {
  const load = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'records.json'), 'utf8'));
  return compareMarkdown({ left: load(left), right: load(right) });
}

function meanOf(values) {
  const numbers = values.filter(Number.isFinite);
  if (numbers.length === 0) return null;
  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

export function caseMeans(records) {
  const byCase = Object.groupBy(records, (record) => record.case);
  const metrics = Object.keys(records[0] ?? {}).filter((key) => key !== 'case' && key !== 'run');
  return Object.entries(byCase).map(([caseId, rows]) => {
    const means = metrics.map((metric) => [metric, meanOf(rows.map((row) => row[metric]))]);
    return { case: caseId, ...Object.fromEntries(means) };
  });
}

export function compareToBaseline({ baselineDir, records }) {
  const stored = JSON.parse(fs.readFileSync(path.join(baselineDir, 'base', 'records.json'), 'utf8'));
  const storedCases = Object.keys(Object.groupBy(stored, (record) => record.case)).length;
  const counts = `runs: baseline ${stored.length} (per-case mean of ${storedCases} cases), new ${records.length}`;
  return `${counts}\n${compareMarkdown({ left: caseMeans(stored), right: caseMeans(records) })}`;
}

function splitCompare(argv) {
  const at = argv.indexOf('--compare');
  if (at === -1) return { rest: argv, compare: null };
  const compare = argv.slice(at + 1, at + 3);
  if (compare.length !== 2 || compare.some((value) => value.startsWith('--'))) throw new UsageError('--compare needs two folders');
  return { rest: [...argv.slice(0, at), ...argv.slice(at + 3)], compare };
}

export function recordedCosts(out, arm) {
  const file = path.join(out, arm, 'records.json');
  if (!fs.existsSync(file)) return [];
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  return records.map((record) => record.costUsd).filter((cost) => typeof cost === 'number');
}

export function projectedCostLine(cellCount, costs) {
  const median = medianCost(costs.map((cost_usd) => ({ cost_usd })));
  if (median === null) return 'projected cost: cost unknown';
  return `projected cost: $${(cellCount * median).toFixed(2)} (${cellCount} cells x median $${median.toFixed(4)} of ${costs.length} recorded runs)`;
}

function plan(flags) {
  const arm = flags.arm ?? 'base';
  const mode = flags.full === true ? 'full' : 'quick';
  const n = Number(flags.n ?? (flags.full === true ? FULL_N : QUICK_N));
  const caseIds = flags.cases === undefined ? Object.keys(CASES) : flags.cases.split(',');
  const unknown = caseIds.filter((id) => !CASES[id]);
  if (!Number.isInteger(n) || n < 1 || unknown.length > 0) throw new UsageError(`bad --n or unknown case ${unknown.join(',')}`);
  return plannedCells({ arm, n, caseIds, mode });
}

async function main(argv) {
  const { rest, compare } = splitCompare(argv);
  if (compare !== null) return console.log(compareDirectories(compare));
  const flags = parseFlags(rest, SPEC);
  if (flags.baseline !== undefined && flags.score === undefined) throw new UsageError('--baseline needs --score');
  if (flags.score !== undefined) {
    const arm = flags.arm ?? 'base';
    console.log(`wrote ${await scoreDirectory({ dir: flags.score, arm, judge: claudeJudge, results: flags.results })}`);
    if (flags.baseline === undefined) return;
    const records = JSON.parse(fs.readFileSync(path.join(flags.score, arm, 'records.json'), 'utf8'));
    return console.log(compareToBaseline({ baselineDir: flags.baseline, records }));
  }
  const cells = plan(flags);
  const out = flags.out ?? path.join(ROOT, 'benchmarks', 'runs', `${today()}-ideas`);
  for (const cell of cells) console.log(`planned ${cell.arm}/${cell.caseId}/${cell.run} (${cell.mode}) -> ${out}`);
  if (flags.confirm !== true) {
    console.log(projectedCostLine(cells.length, recordedCosts(out, cells[0].arm)));
    return console.log(`${cells.length} cells planned, nothing spent; add --confirm to run`);
  }
  const jobs = Number(flags.jobs ?? 1);
  if (!Number.isInteger(jobs) || jobs < 1) throw new UsageError('--jobs needs a positive integer');
  await runCells({ cells, out, jobs });
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof UsageError ? `${USAGE}: ${error.message}` : error);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
