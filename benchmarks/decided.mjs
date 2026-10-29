import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confinedClaude } from '#confine-claude';
import { withoutParentSession } from './lean-gates.mjs';
import { BEFORE_ARM } from './plugin-copies.mjs';
import { ARMS, MODELS, ROOT } from './tasks.mjs';
import { compareMeans as compareStatistics, meanAndSd } from './statistics.mjs';
import { cellFits, cellSpend, copyPluginWithoutTasks, parseSpendCap, prepareValueRepo, scoreValueRepo } from './value.mjs';

export const FIXTURES_ROOT = fileURLToPath(new URL('./decided/', import.meta.url));
const RESULTS_ROOT = fileURLToPath(new URL('./results/', import.meta.url));
const SPLITS = ['train', 'held-out'];
const QUICK_ARMS = [BEFORE_ARM, 'exo'];
const FULL_ARMS = [BEFORE_ARM, 'exo', 'baseline', 'skills-rival'];
const FULL_RUNS = 3;
const QUICK_RUNS = 1;
const CELL_ESTIMATE_USD = 0.6;
const DEFAULT_MAX_BUDGET_USD = 1.5;
const QUICK_MAX_TOTAL_USD = 2;
const REPLY = '1';
const TARGET_RATIO = 0.5;
const BASE_REF = 'origin/main';
const CELL_ENVIRONMENT = { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };

const FLAGS_WITH_VALUE = ['--split', '--runs', '--arms', '--model', '--max-budget-usd', '--max-total-usd'];

function positiveNumber(raw, flag) {
  const value = Number(raw);
  if (raw === undefined || !Number.isFinite(value) || value <= 0) throw new Error(`${flag} needs a positive number, got ${raw === undefined ? 'nothing' : JSON.stringify(raw)}`);
  return value;
}

function readFlags(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--full' || flag === '--dry-run') flags.set(flag, true);
    else if (FLAGS_WITH_VALUE.includes(flag)) flags.set(flag, argv[++index]);
    else throw new Error(`unknown argument ${flag}`);
  }
  return flags;
}

function chosenRuns(flags, quick) {
  const runs = flags.has('--runs') ? positiveNumber(flags.get('--runs'), '--runs') : defaultRuns(quick);
  if (!quick && runs < FULL_RUNS) throw new Error(`--full and --split need --runs of at least ${FULL_RUNS}, got ${runs}`);
  return runs;
}

function defaultRuns(quick) {
  return quick ? QUICK_RUNS : FULL_RUNS;
}

function chosenModel(flags) {
  const model = flags.get('--model') ?? 'sonnet';
  if (!(model in MODELS)) throw new Error(`--model must be ${Object.keys(MODELS).join(', ')}, got ${model}`);
  return model;
}

function chosenArms(flags, quick) {
  const armsText = flags.get('--arms');
  if (armsText !== undefined) return armsText.split(',').filter(Boolean);
  return quick ? QUICK_ARMS : FULL_ARMS;
}

export function parseArguments(argv) {
  const flags = readFlags(argv);
  const split = flags.get('--split');
  if (split !== undefined && !SPLITS.includes(split)) throw new Error(`--split must be ${SPLITS.join(' or ')}, got ${split}`);
  const quick = !flags.has('--full') && split === undefined;
  return {
    quick,
    split: split ?? 'train',
    runs: chosenRuns(flags, quick),
    model: chosenModel(flags),
    dryRun: flags.has('--dry-run'),
    arms: chosenArms(flags, quick),
    maxBudgetUsd: flags.has('--max-budget-usd') ? positiveNumber(flags.get('--max-budget-usd'), '--max-budget-usd') : DEFAULT_MAX_BUDGET_USD,
    maxTotalUsd: flags.has('--max-total-usd') ? parseSpendCap(flags.get('--max-total-usd'), '--max-total-usd') : null
  };
}

export function spendCap(options, runnableCells) {
  if (options.maxTotalUsd !== null) return options.maxTotalUsd;
  if (options.quick) return QUICK_MAX_TOTAL_USD;
  return Math.round(runnableCells.length * CELL_ESTIMATE_USD * 100) / 100;
}

function readFixture(directory) {
  const slug = path.basename(directory);
  const spec = JSON.parse(fs.readFileSync(path.join(directory, 'task.json'), 'utf8'));
  if (!SPLITS.includes(spec.split)) throw new Error(`${slug}/task.json: split must be ${SPLITS.join(' or ')}`);
  for (const key of ['choice', 'alternative']) {
    if (typeof spec[key] !== 'string' || spec[key] === '') throw new Error(`${slug}/task.json: ${key} must be a non-empty string`);
  }
  if (!(spec.timeoutMinutes > 0)) throw new Error(`${slug}/task.json: timeoutMinutes must be a positive number`);
  const prompt = fs.readFileSync(path.join(directory, 'prompt.md'), 'utf8').trim();
  return { ...spec, id: `decided-${slug}`, directory, prompt };
}

export function loadFixtures(root = FIXTURES_ROOT) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFixture(path.join(root, entry.name)));
}

export function selectFixtures(fixtures, { split, quick }) {
  const inSplit = fixtures.filter((fixture) => fixture.split === split);
  return quick ? inSplit.slice(0, 1) : inSplit;
}

export function planCells(fixtures, arms, runs) {
  const runNumbers = Array.from({ length: runs }, (_, index) => index + 1);
  return fixtures.flatMap((fixture) => arms.flatMap((arm) => runNumbers.map((run) => ({ fixture, arm, run }))));
}

export function resultsFile(split) {
  return path.join(RESULTS_ROOT, split === 'held-out' ? 'decided-held-out.json' : 'decided.json');
}

function parseStreamLines(streamText) {
  return streamText.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function toolQuestions(message) {
  const content = message?.message?.content;
  if (message?.type !== 'assistant' || !Array.isArray(content)) return 0;
  return content.filter((part) => part.type === 'tool_use' && part.name === 'AskUserQuestion').length;
}

export function finalResult(streamText) {
  return parseStreamLines(streamText).findLast((message) => message.type === 'result') ?? null;
}

export function countQuestions(streamText) {
  const messages = parseStreamLines(streamText);
  const asked = messages.reduce((sum, message) => sum + toolQuestions(message), 0);
  const reply = finalResult(streamText)?.result;
  if (typeof reply !== 'string') return asked;
  const questionLines = reply.split('\n').filter((line) => line.trim().endsWith('?'));
  return asked + questionLines.length;
}

export function listsDefaultFirst(streamText) {
  const reply = finalResult(streamText)?.result;
  return typeof reply === 'string' && /\*\*Decided for you\*\*\s*\n\s*1\./.test(reply);
}

function share(cells, predicate) {
  return cells.length === 0 ? null : cells.filter(predicate).length / cells.length;
}

export function summarize(cells) {
  const questions = cells.map((cell) => cell.questions);
  return {
    cells: cells.length,
    questions,
    meanQuestions: meanAndSd(questions).mean,
    hiddenPassRate: share(cells, (cell) => cell.defaultPass),
    wrongDefaultRate: share(cells, (cell) => cell.questions === 0 && !cell.defaultPass && cell.alternativePass),
    reversalRate: share(cells, (cell) => cell.defaultPass && cell.reversed)
  };
}

function compareMeans(before, after) {
  const comparison = compareStatistics(before, after);
  if (comparison.verdict !== 'no SE (sd 0)') return comparison;
  return { ...comparison, verdict: comparison.diff < 0 ? 'fall' : 'rise' };
}

export function targetVerdict(beforeCells, afterCells) {
  const before = summarize(beforeCells);
  const after = summarize(afterCells);
  if (before.meanQuestions === 0) return { met: false, note: 'exo-before asks no questions' };
  const comparison = compareMeans(before.questions, after.questions);
  const guard = compareMeans(beforeCells.map((cell) => Number(cell.defaultPass)), afterCells.map((cell) => Number(cell.defaultPass)));
  const halved = after.meanQuestions <= TARGET_RATIO * before.meanQuestions;
  return {
    met: halved && comparison.verdict === 'fall' && guard.verdict !== 'fall',
    ratio: after.meanQuestions / before.meanQuestions,
    verdict: comparison.verdict,
    guardVerdict: guard.verdict
  };
}

function originMainAvailable() {
  const check = spawnSync('git', ['-C', ROOT, 'rev-parse', '--verify', '--quiet', BASE_REF], { stdio: 'ignore' });
  return check.status === 0;
}

function skillsRivalProblem() {
  const arm = ARMS['skills-rival'];
  if (arm.missing !== undefined) return arm.missing;
  return arm.pluginDirs.every((directory) => fs.existsSync(directory)) ? null : 'rival not fetched';
}

export function armProblems(arms) {
  const problems = {};
  if (arms.includes(BEFORE_ARM) && !originMainAvailable()) problems[BEFORE_ARM] = `${BASE_REF} is missing`;
  if (arms.includes('skills-rival') && skillsRivalProblem() !== null) problems['skills-rival'] = 'skipped (no local rival)';
  return problems;
}

function unpackOriginMain(destination) {
  const archive = execFileSync('git', ['-C', ROOT, 'archive', '--format=tar', BASE_REF], { maxBuffer: 512 * 1024 * 1024 });
  fs.mkdirSync(destination, { recursive: true });
  execFileSync('tar', ['-x', '-C', destination], { input: archive });
  return destination;
}

function armSetups(arms, scratch) {
  const setups = {};
  for (const name of arms) {
    if (name === BEFORE_ARM) {
      const unpacked = unpackOriginMain(path.join(scratch, 'before-archive'));
      setups[name] = { pluginDirs: [copyPluginWithoutTasks(unpacked, path.join(scratch, 'before'))], promptSuffix: null };
    } else if (name === 'exo') {
      setups[name] = { pluginDirs: [copyPluginWithoutTasks(ROOT, path.join(scratch, 'exo'))], promptSuffix: null };
    } else {
      setups[name] = { pluginDirs: ARMS[name].pluginDirs, promptSuffix: ARMS[name].promptSuffix };
    }
  }
  return setups;
}

function claudeArguments({ prompt, resume, options, pluginDirs }) {
  const args = [
    '-p', prompt,
    '--model', MODELS[options.model],
    '--output-format', 'stream-json',
    '--verbose',
    '--setting-sources', 'project,local',
    '--strict-mcp-config',
    '--max-budget-usd', String(options.maxBudgetUsd)
  ];
  if (resume !== null) args.push('--resume', resume);
  for (const directory of pluginDirs) args.push('--plugin-dir', directory);
  return args;
}

function runTurn({ args, repo, cellRoot, tmp, timeoutMs }) {
  return new Promise((resolve) => {
    const run = confinedClaude({ args, roots: [cellRoot, tmp], cwd: repo, tmp });
    const child = spawn(run.command, run.args, {
      cwd: run.cwd,
      env: { ...withoutParentSession(process.env), ...CELL_ENVIRONMENT, ...run.env },
      stdio: ['ignore', 'pipe', 'ignore']
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', () => {
      clearTimeout(timer);
      resolve(stdout);
    });
  });
}

function scoringTask(fixture, mode, scratch) {
  const directory = path.join(scratch, mode);
  fs.mkdirSync(directory, { recursive: true });
  fs.cpSync(path.join(fixture.directory, `hidden-${mode}`), path.join(directory, 'hidden'), { recursive: true });
  const check = path.join(fixture.directory, 'check.mjs');
  const source = [
    "import { spawnSync } from 'node:child_process';",
    `const run = spawnSync(process.execPath, [${JSON.stringify(check)}, process.argv[2], ${JSON.stringify(mode)}], { stdio: 'inherit' });`,
    'process.exit(run.status ?? 1);',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(directory, 'check.mjs'), source);
  return { id: `${fixture.id}-${mode}`, directory };
}

export async function passesCheck({ fixture, mode, repo, startTree, scratch }) {
  const copy = path.join(scratch, `repo-${mode}`);
  const task = scoringTask(fixture, mode, scratch);
  try {
    fs.cpSync(repo, copy, { recursive: true });
    const verdict = await scoreValueRepo(task, copy, startTree);
    return verdict.pass === true;
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
    fs.rmSync(task.directory, { recursive: true, force: true });
  }
}

function turnCost(streamText) {
  const cost = finalResult(streamText)?.total_cost_usd;
  return typeof cost === 'number' ? cost : null;
}

function saveTurn(rawDirectory, name, streamText) {
  fs.mkdirSync(rawDirectory, { recursive: true });
  fs.writeFileSync(path.join(rawDirectory, `${name}.jsonl`), streamText);
}

function promptFor(fixture, setup) {
  return setup.promptSuffix === null ? fixture.prompt : `${fixture.prompt} ${setup.promptSuffix}`;
}

function totalCost(costs) {
  const known = costs.filter((value) => value !== null);
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
}

async function reverseOnReply({ cell, setup, options, rawDirectory, context, scoring, sessionId }) {
  const { fixture, arm, run } = cell;
  const args = claudeArguments({ prompt: REPLY, resume: sessionId, options, pluginDirs: setup.pluginDirs });
  const second = await runTurn({ ...context, args });
  saveTurn(rawDirectory, `${fixture.id}-${arm}-${run}-turn2`, second);
  const reversed = await passesCheck({ ...scoring, fixture, mode: 'alternative' });
  return { reversed, cost: turnCost(second) };
}

async function playCell({ cell, setup, options, rawDirectory, repo, cellRoot, tmp }) {
  const { fixture, arm, run } = cell;
  const scratch = path.join(cellRoot, 'scoring');
  const startTree = prepareValueRepo(fixture, repo);
  const context = { repo, cellRoot, tmp, timeoutMs: fixture.timeoutMinutes * 60000 };
  const args = claudeArguments({ prompt: promptFor(fixture, setup), resume: null, options, pluginDirs: setup.pluginDirs });
  const first = await runTurn({ ...context, args });
  saveTurn(rawDirectory, `${fixture.id}-${arm}-${run}-turn1`, first);
  const scoring = { repo, startTree, scratch };
  const defaultPass = await passesCheck({ ...scoring, fixture, mode: 'default' });
  const alternativePass = await passesCheck({ ...scoring, fixture, mode: 'alternative' });
  const sessionId = finalResult(first)?.session_id;
  const record = { task: fixture.id, arm, run, questions: countQuestions(first), defaultPass, alternativePass, reversed: false };
  if (!defaultPass || !listsDefaultFirst(first) || typeof sessionId !== 'string') return { ...record, cost: totalCost([turnCost(first)]) };
  const reply = await reverseOnReply({ cell, setup, options, rawDirectory, context, scoring, sessionId });
  return { ...record, reversed: reply.reversed, cost: totalCost([turnCost(first), reply.cost]) };
}

async function runCell({ cell, setup, options, rawDirectory }) {
  const cellRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-decided-'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-decided-tmp-'));
  try {
    return await playCell({ cell, setup, options, rawDirectory, repo: path.join(cellRoot, 'repo'), cellRoot, tmp });
  } finally {
    fs.rmSync(cellRoot, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function plannedLines(cells, options, problems) {
  const lines = cells.map(({ fixture, arm, run }) => {
    const problem = problems[arm];
    return `planned ${arm} ${fixture.id} run ${run}${problem === undefined ? '' : ` (${problem})`}`;
  });
  const runnable = cells.filter(({ arm }) => problems[arm] === undefined).length;
  const projected = runnable * CELL_ESTIMATE_USD;
  lines.push(`tier ${options.quick ? 'quick' : 'full'}, split ${options.split}, ${runnable} cells, projected $${projected.toFixed(2)} at $${CELL_ESTIMATE_USD} a cell, cap $${options.maxTotalUsd}`);
  lines.push(`writes ${path.relative(ROOT, resultsFile(options.split))}`);
  return lines;
}

function reportLines(records, arms) {
  const lines = [];
  for (const arm of arms) {
    const summary = summarize(records.filter((record) => record.arm === arm));
    if (summary.cells === 0) continue;
    lines.push(`${arm}: questions ${summary.meanQuestions.toFixed(2)} per task over ${summary.cells} cells, hidden pass ${summary.hiddenPassRate}, wrong default ${summary.wrongDefaultRate}, one-reply reversal ${summary.reversalRate}`);
  }
  return lines;
}

async function runCells({ cells, setups, options, rawDirectory }) {
  const records = [];
  let spent = 0;
  for (const cell of cells) {
    if (!cellFits({ spent, expected: CELL_ESTIMATE_USD, cap: options.maxTotalUsd })) {
      console.log(`skipped ${cell.arm} ${cell.fixture.id} run ${cell.run}: over --max-total-usd`);
      continue;
    }
    const record = await runCell({ cell, setup: setups[cell.arm], options, rawDirectory });
    spent += cellSpend({ cost: record.cost, expected: CELL_ESTIMATE_USD });
    records.push(record);
  }
  return records;
}

async function runPaid({ cells, options, problems }) {
  if (problems[BEFORE_ARM] !== undefined) throw new Error(`arm ${BEFORE_ARM}: ${problems[BEFORE_ARM]}`);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-decided-arms-'));
  const rawDirectory = resultsFile(options.split).replace(/\.json$/, '.runs');
  try {
    const setups = armSetups(options.arms.filter((arm) => problems[arm] === undefined), scratch);
    const runnable = cells.filter(({ arm }) => problems[arm] === undefined);
    return await runCells({ cells: runnable, setups, options, rawDirectory });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function finish({ records, options }) {
  const target = options.arms.includes(BEFORE_ARM) && options.arms.includes('exo')
    ? targetVerdict(records.filter((record) => record.arm === BEFORE_ARM), records.filter((record) => record.arm === 'exo'))
    : null;
  const summaries = Object.fromEntries(options.arms.map((arm) => [arm, summarize(records.filter((record) => record.arm === arm))]));
  const output = { split: options.split, tier: options.quick ? 'quick' : 'full', model: options.model, runs: options.runs, summaries, target, cells: records };
  fs.mkdirSync(RESULTS_ROOT, { recursive: true });
  fs.writeFileSync(resultsFile(options.split), `${JSON.stringify(output, null, 2)}\n`);
  for (const line of reportLines(records, options.arms)) console.log(line);
  if (target !== null) console.log(`target ${target.met ? 'met' : 'unmet'}: ${JSON.stringify(target)}`);
  console.log(`wrote ${path.relative(ROOT, resultsFile(options.split))}`);
}

export async function main(argv) {
  const parsed = parseArguments(argv);
  const fixtures = selectFixtures(loadFixtures(), parsed);
  const cells = planCells(fixtures, parsed.arms, parsed.runs);
  const problems = armProblems(parsed.arms);
  const options = { ...parsed, maxTotalUsd: spendCap(parsed, cells.filter(({ arm }) => problems[arm] === undefined)) };
  for (const [arm, problem] of Object.entries(problems)) console.log(`${arm}: ${problem}`);
  if (options.dryRun) {
    for (const line of plannedLines(cells, options, problems)) console.log(line);
    return;
  }
  const records = await runPaid({ cells, options, problems });
  finish({ records, options });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
