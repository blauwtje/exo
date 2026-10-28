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

const USAGE = 'Usage: node benchmarks/review-replay.mjs [--checkout <exo checkout>] [--full] [--dry-run] [--rescore <runs dir>] [--resume] [--task <fixture or safe task id>]... [--rounds <n>] [--repeat <n>] [--jobs <n>] [--budget-usd <n>] [--save-baseline] [--out <path>] [--model <id>]';
const SAFE = path.join(ROOT, 'benchmarks', 'safe');
const REPLAY = path.join(ROOT, 'benchmarks', 'review-replay');
const QUICK_BUDGET_USD = 1;
const QUICK_REPEAT = 1;
const FULL_REPEAT = 3;
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

function keepRecord({ keepDir, task, index }, paths, result) {
  if (!keepDir) return;
  const target = path.join(keepDir, `${task.id}-r${index}`);
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(path.join(paths.repository, '.exo'), target, { recursive: true });
  fs.writeFileSync(path.join(target, 'run.json'), `${JSON.stringify({ task: task.id, ...result }, null, 2)}\n`);
}

async function runOnce(options, { task, index }, modelFor) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), RUN_PREFIX));
  try {
    const paths = prepareCase(base, task, options.safeRoot);
    const context = { pluginDir: options.pluginDir, paths, plants: loadPlants(task, options.safeRoot), rounds: options.rounds };
    const startedAt = Date.now();
    const result = { ...await replayCase(context, modelFor(base)), durationMs: Date.now() - startedAt };
    keepRecord({ keepDir: options.keepDir, task, index }, paths, result);
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

function keptResult(options, { task, index }) {
  if (!options.resume || !options.keepDir) return null;
  const file = path.join(options.keepDir, `${task.id}-r${index}`, 'run.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

export async function replayAll(options, modelFor) {
  const items = options.tasks.flatMap((task) => Array.from({ length: options.repeat }, (_, index) => ({ task, index })));
  const finished = new Map(options.tasks.map((task) => [task, []]));
  const queue = [];
  for (const item of items) {
    const kept = keptResult(options, item);
    if (kept) finished.get(item.task).push(kept);
    else queue.push(item);
  }
  const budget = options.budgetUsd ?? Infinity;
  let spent = 0;
  const worker = async () => {
    while (queue.length > 0 && spent <= budget) {
      const item = queue.shift();
      const run = await runOnce(options, item, modelFor);
      spent += run.costUsd;
      finished.get(item.task).push(run);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.jobs ?? 1, queue.length) }, worker));
  return options.tasks.map((task) => ({ ...summarize(task, finished.get(task)), skipped: options.repeat - finished.get(task).length }));
}

function spread({ mean, sd }) {
  if (mean === null) return '-';
  return sd === null ? mean.toFixed(2) : `${mean.toFixed(2)} ± ${sd.toFixed(2)}`;
}

function baselineText(row) {
  if (!row) return '-';
  return `fixed ${row.fixedAfterOneRepair?.toFixed(2) ?? '-'}, never clean ${row.neverClean}, $${row.costUsdPerRun.toFixed(2)}/run`;
}

export function withBaseline(cells, rows) {
  return cells.map((cell) => ({ ...cell, baseline: rows.find((row) => row.task === cell.task) ?? null }));
}

export function saveBaseline(file, cells, { model, source }) {
  const measured = cells.filter((cell) => cell.runs > 0).map((cell) => ({
    task: cell.task,
    runs: cell.runs,
    costUsdPerRun: Number((cell.costUsd / cell.runs).toFixed(4)),
    fixedAfterOneRepair: cell.fixedAfterOneRepair.mean,
    neverClean: cell.neverClean,
    model,
    source
  }));
  const kept = JSON.parse(fs.readFileSync(file, 'utf8')).filter((row) => !measured.some((fresh) => fresh.task === row.task));
  const rows = [...kept, ...measured].sort((left, right) => left.task.localeCompare(right.task));
  fs.writeFileSync(file, `[\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(',\n')}\n]\n`);
}

export function renderTable(cells) {
  const header = ['task', 'runs', 'skipped', 'failures', 'fixed after one repair', 'false fix lines', 'rounds to clean', 'never clean', 'cost usd', 'baseline'];
  const rows = cells.map((cell) => [cell.task, cell.runs, cell.skipped, cell.failures, spread(cell.fixedAfterOneRepair), spread(cell.falseFixLines), spread(cell.roundsToClean), cell.neverClean, cell.costUsd.toFixed(2), baselineText(cell.baseline)]);
  return `${[header, header.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n')}\n`;
}

export function writeReport({ out, keepDir, mode, cells, durationMs }) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, `${renderTable(cells)}\nRun records: ${keepDir}\n`);
  const log = { mode, cost_usd: cells.reduce((sum, cell) => sum + cell.costUsd, 0), durationMs, cells };
  fs.writeFileSync(`${out}.json`, `${JSON.stringify(log, null, 2)}\n`);
}

function readReplayJson(name) {
  return JSON.parse(fs.readFileSync(path.join(REPLAY, name), 'utf8'));
}

function resolveTask(known, id) {
  const task = known.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`unknown task '${id}'`);
  return task;
}

function optionsOf(flags) {
  const fixtures = loadFixtures();
  const known = [...fixtures, ...SAFE_TASKS];
  const mode = flags.full ? 'full' : 'quick';
  const defaults = mode === 'quick' ? readReplayJson('quick.json').map((id) => resolveTask(known, id)) : fixtures;
  const budget = flags['budget-usd'] ?? (mode === 'quick' ? QUICK_BUDGET_USD : undefined);
  return {
    tasks: flags.task ? flags.task.map((id) => resolveTask(known, id)) : defaults,
    pluginDir: path.resolve(flags.checkout ?? ROOT),
    rounds: Number(flags.rounds ?? 3),
    repeat: Number(flags.repeat ?? (mode === 'quick' ? QUICK_REPEAT : FULL_REPEAT)),
    jobs: Number(flags.jobs ?? os.availableParallelism()),
    budgetUsd: budget === undefined ? undefined : Number(budget),
    mode,
    resume: flags.resume,
    model: flags.model ?? MODELS.sonnet,
    safeRoot: SAFE,
    keepDir: flags.out ? path.resolve(`${flags.out}.runs`) : undefined
  };
}

export function projectRun(options, rows = readReplayJson('baseline.json')) {
  const fallback = rows.reduce((sum, row) => sum + row.costUsdPerRun, 0) / rows.length;
  const cells = options.tasks.flatMap((task) => Array.from({ length: options.repeat }, (_, run) => ({
    task: task.id,
    run,
    projectedUsd: rows.find((row) => row.task === task.id)?.costUsdPerRun ?? fallback
  })));
  const projectedUsd = Number(cells.reduce((sum, cell) => sum + cell.projectedUsd, 0).toFixed(2));
  return { mode: options.mode, cells, projectedUsd, budgetUsd: options.budgetUsd ?? null };
}

export function rescoreRuns(runsDir) {
  const byTask = new Map();
  const names = fs.readdirSync(runsDir).sort();
  for (const name of names) {
    const file = path.join(runsDir, name, 'run.json');
    if (!fs.existsSync(file)) continue;
    if (!/-r\d+$/.test(name)) continue;
    const task = name.replace(/-r\d+$/, '');
    byTask.set(task, [...byTask.get(task) ?? [], JSON.parse(fs.readFileSync(file, 'utf8'))]);
  }
  return [...byTask].map(([task, runs]) => ({ ...summarize({ id: task }, runs), skipped: 0 }));
}

function rescoreReport(flags) {
  const keepDir = path.resolve(flags.rescore);
  const cells = withBaseline(rescoreRuns(keepDir), readReplayJson('baseline.json'));
  if (flags.out) writeReport({ out: flags.out, keepDir, mode: 'rescore', cells, durationMs: 0 });
  process.stdout.write(`${JSON.stringify(cells, null, 2)}\n`);
}

export async function main(argv, { modelFor: injected } = {}) {
  const flags = parseFlags(argv, { checkout: 'value', task: 'list', rounds: 'value', repeat: 'value', jobs: 'value', 'budget-usd': 'value', out: 'value', rescore: 'value', model: 'value', full: 'boolean', resume: 'boolean', 'dry-run': 'boolean', 'save-baseline': 'boolean' }, { usage: USAGE });
  if (flags.rescore) return rescoreReport(flags);
  if (flags.resume && !flags.out) throw new Error('--resume needs --out <path>: it reads the kept runs under <path>.runs; nothing was run');
  const options = optionsOf(flags);
  const projection = projectRun(options);
  if (flags['dry-run']) {
    process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
    return;
  }
  if (projection.projectedUsd > (options.budgetUsd ?? Infinity)) throw new Error(`projected ${projection.projectedUsd} usd is over --budget-usd ${options.budgetUsd}; nothing was run`);
  const modelFor = injected ?? ((base) => claudeModel({ pluginDir: options.pluginDir, model: options.model, base }));
  const startedAt = Date.now();
  const stored = readReplayJson('baseline.json');
  const measured = await replayAll(options, modelFor);
  const cells = withBaseline(measured, stored);
  if (flags['save-baseline']) saveBaseline(path.join(REPLAY, 'baseline.json'), measured, { model: options.model, source: `benchmarks/review-replay.mjs ${options.mode} ${new Date().toISOString().slice(0, 10)}` });
  if (flags.out) writeReport({ out: flags.out, keepDir: options.keepDir, mode: options.mode, cells, durationMs: Date.now() - startedAt });
  process.stdout.write(`${JSON.stringify(cells, null, 2)}\n`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
