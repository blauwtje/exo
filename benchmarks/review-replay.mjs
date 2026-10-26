import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confinedClaude } from '#confine-claude';
import { parseFlags } from '#script-flags';
import { ISOLATION_ENV, withoutParentSession } from './lean-gates.mjs';
import { meanAndSd } from './statistics.mjs';
import { defectRange, prepareReviewBranch, reviewPlanText } from './sweep-fixtures.mjs';
import { MODELS, ROOT, SAFE_TASKS } from './tasks.mjs';

const USAGE = 'Usage: node benchmarks/review-replay.mjs [--checkout <exo checkout>] [--task <fixture or safe task id>]... [--rounds <n>] [--repeat <n>] [--jobs <n>] [--budget-usd <n>] [--out <path>] [--model <id>]';
const SAFE = path.join(ROOT, 'benchmarks', 'safe');
const REPLAY = path.join(ROOT, 'benchmarks', 'review-replay');
const SEED_SUFFIX = '.seed';
const GIT_SETTINGS = ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com', '-c', 'commit.gpgsign=false'];
const FINDING = /^([^\s:;]+):(\d+)(?:-(\d+))?\s*;?\s*(defect|concern|question|note)\b(.*)$/;
const HUNK = /^@@ -(\d+)(?:,(\d+))? /;
const VERDICT_LINE = /^verdict=(\w+) .*\bconcern=(\d+) .*\bfix=(\d+)/m;
const REPORT_LINE = /\breport=(\S+)\s*$/m;
const RECURRING_LINE = /^BLOCKED recurring (.+)$/m;
const RUN_PREFIX = 'review-replay-';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function git(repository, args) {
  return execFileSync('git', ['-C', repository, ...GIT_SETTINGS, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function seedSources(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) return seedSources(path.join(directory, entry.name), relative);
    return entry.name.endsWith(SEED_SUFFIX) ? [relative.slice(0, -SEED_SUFFIX.length)] : [];
  });
}

export function loadFixtures(root = REPLAY) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const dir = path.join(root, entry.name);
    const sources = seedSources(dir);
    if (sources.length !== 1) throw new Error(`fixture '${entry.name}' needs exactly one ${SEED_SUFFIX} source, found ${sources.length}`);
    const plants = JSON.parse(fs.readFileSync(path.join(dir, 'plants.json'), 'utf8'));
    return { id: entry.name, dir, file: sources[0], plants, prompt: `Add \`${sources[0]}\` to this repository.` };
  });
}

export function loadPlants(task, safeRoot = SAFE) {
  if (task.plants) return task.plants;
  const file = path.join(safeRoot, task.id, 'plants.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const { start, end } = defectRange(task);
  return [{ path: task.file, range: `${start}-${end}`, class: 'defect' }];
}

function parseRange(range) {
  const [start, end = start] = String(range).split('-').map(Number);
  return { start, end };
}

export function parseFindings(text) {
  return text.split('\n').map((line) => line.match(FINDING)).filter(Boolean).map((match) => ({
    path: match[1],
    start: Number(match[2]),
    end: Number(match[3] ?? match[2]),
    weight: match[4],
    fix: /\bfix\s*$/.test(match[5])
  }));
}

export function isClean(text) {
  if (/^BLOCKED\b/m.test(text)) return false;
  return !parseFindings(text).some((finding) => finding.fix || finding.weight === 'concern');
}

export function changedRanges(diff) {
  const ranges = [];
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ')) file = line.slice(4).replace(/^a\//, '');
    const hunk = line.match(HUNK);
    if (!hunk) continue;
    const start = Number(hunk[1]);
    ranges.push({ path: file, start, end: start + Math.max(Number(hunk[2] ?? 1), 1) - 1 });
  }
  return ranges;
}

function overlaps(left, right) {
  return left.path === right.path && left.start <= right.end && right.start <= left.end;
}

export function gradeRepair(plants, findingsText, diff) {
  const planted = plants.map((plant) => ({ path: plant.path, ...parseRange(plant.range) }));
  const changed = changedRanges(diff);
  const fixLines = parseFindings(findingsText).filter((finding) => finding.fix);
  return {
    planted: planted.length,
    fixed: planted.filter((plant) => changed.some((range) => overlaps(plant, range))).length,
    falseFix: fixLines.filter((finding) => !planted.some((plant) => overlaps(plant, finding))).length
  };
}

function taskPlanText(task) {
  const data = `Data: \`${task.file}\` | Proof: node --check ${task.file}`;
  return `${reviewPlanText(task)}\n## Tasks\n\n### Task 1: feat(safe): implement ${task.id}\n\nDepends on: none | Files: \`${task.file}\` | ${data}\n`;
}

function stageFixture(base, task) {
  const root = path.join(base, 'fixture-root');
  const target = path.join(root, task.id, 'seed', task.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(task.dir, `${task.file}${SEED_SUFFIX}`), target);
  return root;
}

export function prepareCase(base, task, safeRoot = SAFE) {
  const repository = path.join(base, 'repo');
  const plan = path.join(base, 'plan', `${task.id}.md`);
  fs.mkdirSync(path.dirname(path.join(repository, task.file)), { recursive: true });
  fs.mkdirSync(path.dirname(plan));
  prepareReviewBranch(repository, task, 'seed', task.dir ? stageFixture(base, task) : safeRoot);
  git(repository, ['commit', '-q', '--amend', '-m', `feat(safe): implement ${task.id}`, '-m', 'Plan-task: 1']);
  fs.appendFileSync(path.join(repository, '.git', 'info', 'exclude'), '.exo/\n');
  fs.writeFileSync(plan, taskPlanText(task));
  return { repository, plan };
}

export function dispatchLine(pluginDir, { repository, plan }) {
  const verify = path.join(pluginDir, 'skills', 'verify', 'scripts', 'verify.mjs');
  const printed = execFileSync(process.execPath, [verify, '--reviews-only', '--plan', plan, '--root', repository, '--base', 'main'], { encoding: 'utf8' });
  return printed.split('\n').find((line) => line.startsWith('DISPATCH Branch:')) ?? null;
}

function reviewPrompt(line) {
  return `Dispatch one exo:review-branch agent with exo-kind: review-deep first, then the fields of this line, and reply with its return line only.\n${line}`;
}

function fixerPrompt(pluginDir, { repository, plan, findings }) {
  const prompt = path.join(pluginDir, 'skills', 'build', 'review-fixer-prompt.md');
  return `Dispatch one exo:fix-review agent with no model override and the prompt file ${prompt} by path. Fill values: plan path ${plan}, root ${repository}, base main, findings path ${findings}. Reply with its return line only.`;
}

function commitRepair(repository, round) {
  git(repository, ['add', '-A']);
  git(repository, ['commit', '-q', '--allow-empty', '-m', `fix(safe): repair round ${round}`]);
}

function runVerifyScript(pluginDir, script, args) {
  const file = path.join(pluginDir, 'skills', 'verify', 'scripts', script);
  if (!fs.existsSync(file)) return null;
  return spawnSync(process.execPath, [file, ...args], { encoding: 'utf8' }).stdout;
}

function mergeStep(pluginDir, { repository, findings }) {
  const printed = runVerifyScript(pluginDir, 'merge-reviews.mjs', ['--root', repository, '--report', findings]);
  if (printed === null) return { clean: null, stopReason: null, report: findings };
  const recurring = printed.match(RECURRING_LINE);
  const verdict = printed.match(VERDICT_LINE);
  return {
    report: printed.match(REPORT_LINE)?.[1] ?? findings,
    clean: verdict !== null && verdict[1] !== 'BLOCKED' && Number(verdict[2]) === 0 && Number(verdict[3]) === 0,
    stopReason: recurring === null ? null : `recurring ${recurring[1]}`
  };
}

function snapshotRound({ repository, findings }, round) {
  const target = path.join(repository, '.exo', 'rounds', `review-${round}.md`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(findings, target);
}

async function repairRound(context, model, { round, merged }) {
  const { pluginDir, paths } = context;
  const findingsText = fs.readFileSync(merged.report, 'utf8');
  if (merged.clean ?? isClean(findingsText)) return { clean: true, findingsText };
  await model(fixerPrompt(pluginDir, { ...paths, findings: merged.report }), paths.repository);
  runVerifyScript(pluginDir, 'run-probes.mjs', ['--report', merged.report, '--root', paths.repository]);
  const diff = git(paths.repository, ['diff', '-U0', 'HEAD']);
  commitRepair(paths.repository, round);
  return { clean: false, findingsText, diff };
}

async function playRounds(context, model) {
  const { pluginDir, paths, plants, rounds } = context;
  const result = { roundsToClean: null, failure: null, stopReason: null, grade: null };
  for (let round = 1; round <= rounds; round += 1) {
    const line = dispatchLine(pluginDir, paths);
    if (line === null) return { ...result, failure: 'no DISPATCH Branch line' };
    const review = { ...paths, findings: line.match(/\bfindings=(\S+)/)?.[1] };
    await model(reviewPrompt(line), paths.repository);
    if (!review.findings || !fs.existsSync(review.findings)) return { ...result, failure: 'no findings file' };
    snapshotRound(review, round);
    const merged = mergeStep(pluginDir, review);
    if (merged.stopReason !== null) return { ...result, stopReason: merged.stopReason };
    const step = await repairRound(context, model, { round, merged });
    if (round === 1 && !step.clean) result.grade = gradeRepair(plants, step.findingsText, step.diff);
    if (step.clean) return { ...result, roundsToClean: round };
  }
  return result;
}

export async function replayCase(context, model) {
  const spent = { costUsd: 0 };
  const metered = async (prompt, cwd) => {
    spent.costUsd += (await model(prompt, cwd)) ?? 0;
  };
  const result = await playRounds(context, metered);
  return { ...result, costUsd: spent.costUsd };
}

function runClaude(run, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(run.command, run.args, { cwd: run.cwd, env, timeout: SESSION_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = { stdout: '', stderr: '' };
    child.stdout.on('data', (chunk) => { output.stdout += chunk; });
    child.stderr.on('data', (chunk) => { output.stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ ...output, status }));
  });
}

export function claudeModel({ pluginDir, model, base }) {
  return async (prompt, cwd) => {
    const tmp = path.join(base, 'tmp');
    fs.mkdirSync(tmp, { recursive: true });
    const args = ['-p', prompt, '--plugin-dir', pluginDir, '--model', model, '--setting-sources', 'project,local', '--strict-mcp-config', '--output-format', 'json'];
    const run = confinedClaude({ args, roots: [base], cwd, tmp });
    const env = { ...withoutParentSession(process.env), ...ISOLATION_ENV, ...run.env };
    const finished = await runClaude(run, env);
    if (finished.status !== 0) throw new Error(`claude exited ${finished.status}: ${finished.stderr.slice(-300)}`);
    return Number(JSON.parse(finished.stdout).total_cost_usd);
  };
}

function keepRecord({ keepDir, task, base }, paths, result) {
  if (!keepDir) return;
  const target = path.join(keepDir, `${task.id}-${path.basename(base).slice(RUN_PREFIX.length)}`);
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(path.join(paths.repository, '.exo'), target, { recursive: true });
  fs.writeFileSync(path.join(target, 'run.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function runOnce(options, task, modelFor) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), RUN_PREFIX));
  try {
    const paths = prepareCase(base, task, options.safeRoot);
    const context = { pluginDir: options.pluginDir, paths, plants: loadPlants(task, options.safeRoot), rounds: options.rounds };
    const result = await replayCase(context, modelFor(base));
    keepRecord({ keepDir: options.keepDir, task, base }, paths, result);
    return result;
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

export function summarize(task, runs) {
  const graded = runs.filter((run) => run.grade !== null);
  const rate = graded.map((run) => run.grade.fixed / run.grade.planted);
  return {
    task: task.id,
    runs: runs.length,
    failures: runs.filter((run) => run.failure !== null).length,
    fixedAfterOneRepair: meanAndSd(rate),
    falseFixLines: meanAndSd(graded.map((run) => run.grade.falseFix)),
    roundsToClean: meanAndSd(runs.map((run) => run.roundsToClean).filter((rounds) => rounds !== null)),
    neverClean: runs.filter((run) => run.roundsToClean === null).length,
    costUsd: runs.reduce((sum, run) => sum + run.costUsd, 0)
  };
}

export async function replayAll(options, modelFor) {
  const queue = options.tasks.flatMap((task) => Array.from({ length: options.repeat }, () => task));
  const finished = new Map(options.tasks.map((task) => [task, []]));
  const budget = options.budgetUsd ?? Infinity;
  let spent = 0;
  const worker = async () => {
    while (queue.length > 0 && spent <= budget) {
      const task = queue.shift();
      const run = await runOnce(options, task, modelFor);
      spent += run.costUsd;
      finished.get(task).push(run);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.jobs ?? 1, queue.length) }, worker));
  return options.tasks.map((task) => ({ ...summarize(task, finished.get(task)), skipped: options.repeat - finished.get(task).length }));
}

function spread({ mean, sd }) {
  if (mean === null) return '-';
  return sd === null ? mean.toFixed(2) : `${mean.toFixed(2)} ± ${sd.toFixed(2)}`;
}

export function renderTable(cells) {
  const header = ['task', 'runs', 'skipped', 'failures', 'fixed after one repair', 'false fix lines', 'rounds to clean', 'never clean', 'cost usd'];
  const rows = cells.map((cell) => [cell.task, cell.runs, cell.skipped, cell.failures, spread(cell.fixedAfterOneRepair), spread(cell.falseFixLines), spread(cell.roundsToClean), cell.neverClean, cell.costUsd.toFixed(2)]);
  return `${[header, header.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n')}\n`;
}

function optionsOf(flags) {
  const fixtures = loadFixtures();
  const known = [...fixtures, ...SAFE_TASKS];
  const defaults = fixtures.length > 0 ? fixtures : SAFE_TASKS;
  const tasks = flags.task ? flags.task.map((id) => known.find((task) => task.id === id) ?? (() => { throw new Error(`unknown task '${id}'`); })()) : defaults;
  return {
    tasks,
    pluginDir: path.resolve(flags.checkout ?? ROOT),
    rounds: Number(flags.rounds ?? 3),
    repeat: Number(flags.repeat ?? 1),
    jobs: Number(flags.jobs ?? os.availableParallelism()),
    budgetUsd: flags['budget-usd'] === undefined ? undefined : Number(flags['budget-usd']),
    model: flags.model ?? MODELS.sonnet,
    safeRoot: SAFE,
    keepDir: flags.out ? path.resolve(`${flags.out}.runs`) : undefined
  };
}

async function main(argv) {
  const flags = parseFlags(argv, { checkout: 'value', task: 'list', rounds: 'value', repeat: 'value', jobs: 'value', 'budget-usd': 'value', out: 'value', model: 'value' }, { usage: USAGE });
  const options = optionsOf(flags);
  const modelFor = (base) => claudeModel({ pluginDir: options.pluginDir, model: options.model, base });
  const cells = await replayAll(options, modelFor);
  if (flags.out) {
    fs.mkdirSync(path.dirname(path.resolve(flags.out)), { recursive: true });
    fs.writeFileSync(flags.out, `${renderTable(cells)}\nRun records: ${options.keepDir}\n`);
  }
  process.stdout.write(`${JSON.stringify(cells, null, 2)}\n`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
