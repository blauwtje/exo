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
import { copyPluginWithoutTasks } from './value.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CASES = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'ideas', 'cases.json'), 'utf8'));
const FIXTURES = '/tmp/exo-pressure/spec';
const SETUP = path.join(import.meta.dirname, 'pressure', 'spec', 'setup.sh');
const RUN_FILES = 'benchmarks/runs/<date>-ideas/<arm>/<case>/<i>/{stdout.json,final.md}';
const USAGE = 'usage: ideas.mjs [--arm base|<variant>] [--n <int>] [--cases <ids>] [--confirm] [--out <dir>] | --score <dir> [--arm <name>] [--results <file>] | --compare <dir> <dir>; each run writes ' + RUN_FILES;
const SPEC = { arm: 'value', n: 'value', cases: 'value', confirm: 'boolean', out: 'value', score: 'value', results: 'value' };
export const MAKER_LINE = 'Which designs could do this? Recommend one.';
export const HEADLESS_LINE = 'No one will answer questions; decide any open point yourself.';
const DEFAULT_N = 5;

export function makerPrompt(feature) {
  return `/exo:spec ${feature} ${MAKER_LINE} ${HEADLESS_LINE}`;
}

export function plannedCells({ arm, n, caseIds }) {
  return caseIds.flatMap((caseId) => Array.from({ length: n }, (_, index) => ({ arm, caseId, run: index + 1 })));
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
export function makerArguments({ prompt, plugin }) {
  return ['-p', prompt, '--model', 'opus', '--effort', 'high', '--output-format', 'stream-json', '--verbose', '--setting-sources', 'project,local', '--strict-mcp-config', '--plugin-dir', plugin];
}

function runClaude({ cell, plugin, scratch, home }) {
  const fixture = path.join(FIXTURES, CASES[cell.caseId].fixture);
  if (!fs.existsSync(fixture)) spawnSync('bash', [SETUP], { stdio: 'inherit' });
  const work = fs.mkdtempSync(path.join(scratch, 'work-'));
  const tmp = fs.mkdtempSync(path.join(scratch, 'tmp-'));
  fs.cpSync(fixture, work, { recursive: true });
  const prompt = makerPrompt(CASES[cell.caseId].feature);
  const run = confinedClaude({ args: makerArguments({ prompt, plugin }), roots: [scratch], cwd: work, tmp });
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

async function runCells({ cells, out }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-ideas-'));
  const plugin = armCopy({ arm: cells[0].arm, scratch });
  const home = makeCellHome();
  try {
    await runEach({ cells, out, plugin, scratch, home });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function runEach({ cells, out, plugin, scratch, home }) {
  for (const cell of cells) {
    const outcome = await runClaude({ cell, plugin, scratch, home });
    const folder = path.join(out, cell.arm, cell.caseId, String(cell.run));
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'stdout.json'), outcome.stdout);
    fs.writeFileSync(path.join(folder, 'stderr.log'), outcome.stderr);
    for (const name of ['final.md', 'failed.json']) fs.rmSync(path.join(folder, name), { force: true });
    const reason = runFailure(outcome);
    if (reason === null) fs.writeFileSync(path.join(folder, 'final.md'), finalText(outcome.stdout));
    else fs.writeFileSync(path.join(folder, 'failed.json'), `${JSON.stringify({ reason, exitCode: outcome.exitCode, signal: outcome.signal, timedOut: outcome.timedOut }, null, 2)}\n`);
    for (const wrong of wrongCopyDirs(outcome.stdout, plugin)) console.warn(`WRONG COPY ${cell.arm}/${cell.caseId}/${cell.run}: ${wrong} is not under ${plugin}`);
    console.log(`${reason === null ? 'done' : `FAILED (${reason})`} ${cell.arm}/${cell.caseId}/${cell.run}`);
  }
}

function failureOf(runDir) {
  const file = path.join(runDir, 'failed.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).reason ?? 'failed';
  return fs.existsSync(path.join(runDir, 'final.md')) ? null : 'no final.md';
}

function readRuns(armDir) {
  const runsByCase = {};
  const failed = [];
  for (const caseId of fs.readdirSync(armDir).filter((name) => CASES[name])) {
    const caseDir = path.join(armDir, caseId);
    runsByCase[caseId] = [];
    for (const run of fs.readdirSync(caseDir).sort((a, b) => a - b)) {
      const reason = failureOf(path.join(caseDir, run));
      if (reason === null) runsByCase[caseId].push({ run: Number(run), finalText: fs.readFileSync(path.join(caseDir, run, 'final.md'), 'utf8') });
      else failed.push(`${caseId}/${run} (${reason})`);
    }
  }
  return { runsByCase, failed };
}

export async function scoreDirectory({ dir, arm, judge, results }) {
  const armDir = path.join(dir, arm);
  const { runsByCase, failed } = readRuns(armDir);
  const scored = await scoreArm({ judge, cases: CASES, runsByCase });
  fs.writeFileSync(path.join(armDir, 'records.json'), JSON.stringify(scored.records, null, 2));
  const file = results ?? path.join(ROOT, 'benchmarks', 'results', `${today()}-ideas-${arm}.md`);
  fs.writeFileSync(file, resultsMarkdown({ arm, ...scored, failed }));
  return file;
}

function compareDirectories([left, right]) {
  const load = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'records.json'), 'utf8'));
  return compareMarkdown({ left: load(left), right: load(right) });
}

function splitCompare(argv) {
  const at = argv.indexOf('--compare');
  if (at === -1) return { rest: argv, compare: null };
  const compare = argv.slice(at + 1, at + 3);
  if (compare.length !== 2 || compare.some((value) => value.startsWith('--'))) throw new UsageError('--compare needs two folders');
  return { rest: [...argv.slice(0, at), ...argv.slice(at + 3)], compare };
}

function plan(flags) {
  const arm = flags.arm ?? 'base';
  const n = Number(flags.n ?? DEFAULT_N);
  const caseIds = flags.cases === undefined ? Object.keys(CASES) : flags.cases.split(',');
  const unknown = caseIds.filter((id) => !CASES[id]);
  if (!Number.isInteger(n) || n < 1 || unknown.length > 0) throw new UsageError(`bad --n or unknown case ${unknown.join(',')}`);
  return plannedCells({ arm, n, caseIds });
}

async function main(argv) {
  const { rest, compare } = splitCompare(argv);
  if (compare !== null) return console.log(compareDirectories(compare));
  const flags = parseFlags(rest, SPEC);
  if (flags.score !== undefined) {
    return console.log(`wrote ${await scoreDirectory({ dir: flags.score, arm: flags.arm ?? 'base', judge: claudeJudge, results: flags.results })}`);
  }
  const cells = plan(flags);
  const out = flags.out ?? path.join(ROOT, 'benchmarks', 'runs', `${today()}-ideas`);
  for (const cell of cells) console.log(`planned ${cell.arm}/${cell.caseId}/${cell.run} -> ${out}`);
  if (flags.confirm !== true) return console.log(`${cells.length} cells planned, nothing spent; add --confirm to run`);
  await runCells({ cells, out });
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof UsageError ? `${USAGE}: ${error.message}` : error);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
