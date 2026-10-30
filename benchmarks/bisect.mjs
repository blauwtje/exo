import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confinedClaude } from '#confine-claude';
import { killTree } from '#process-tree';
import { isMain } from '#script-flags';
import { usageCounts } from '#token-weights';
import { LOCAL_FILE } from '../lib/settings-store.mjs';
import { buildCase, culpritSha, reproGreen, startCommit } from './bisect-repo.mjs';
import { summarize, summaryLines } from './bisect-summary.mjs';
import { validateCase } from './bisect-validate.mjs';
import { withoutParentSession } from './lean-gates.mjs';
import { countsCost } from './pricing.mjs';
import { BEFORE_ARM, beforePluginProblem } from './plugin-copies.mjs';
import { MODELS, ROOT } from './tasks.mjs';
import { EXO_SETTINGS, cellFits, cellSpend, copyPluginWithoutTasks, parseSpendCap } from './value.mjs';

const CASES_ROOT = fileURLToPath(new URL('./bisect/', import.meta.url));
const RESULTS_ROOT = fileURLToPath(new URL('./results/', import.meta.url));
const KNOWN_ARMS = [BEFORE_ARM, 'exo'];
const KINDS = ['regression', 'never-worked', 'flaky', 'plain'];
const TIERS = ['quick', 'full'];
const DEFAULT_RUNS = 3;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_FLAKY_RUNS = 5;
const DEFAULT_MAX_BUDGET_USD = 2;
const QUICK_MAX_TOTAL_USD = 20;
const CELL_ESTIMATE_USD = 0.8;
const MODEL = 'sonnet';
const EFFORT = 'medium';
const MIN_SHA_PREFIX = 7;
const BISECT_COMMAND = /bisect\.mjs|git bisect/;
const CELL_ENVIRONMENT = { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
const PROMPT_MODES = ['skill', 'natural'];
const SKILL_PREFIX = '/exo:find-cause ';
const COMMAND_EXPANSION = /<command-name>\/?exo:find-cause/;
const FIND_CAUSE_PATH = 'find-cause/';
const BOOLEAN_FLAGS = ['--dry-run', '--full', '--fresh', '--validate', '--report'];
const VALUE_FLAGS = ['--cases', '--runs', '--arms', '--before-plugin', '--max-budget-usd', '--max-total-usd', '--concurrency', '--prompt-mode'];

export function defaultPaths(casesRoot = CASES_ROOT, resultsRoot = RESULTS_ROOT) {
  return {
    cases: casesRoot,
    records: path.join(resultsRoot, 'bisect.jsonl'),
    summary: path.join(resultsRoot, 'bisect-summary.json'),
    streams: path.join(resultsRoot, 'bisect.runs')
  };
}

function positiveNumber(raw, flag) {
  const value = Number(raw);
  const valid = typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(value) && value > 0;
  if (!valid) throw new Error(`${flag} needs a positive number, got ${raw === undefined ? 'nothing' : JSON.stringify(raw)}`);
  return value;
}

function positiveInteger(raw, flag) {
  const value = positiveNumber(raw, flag);
  if (!Number.isInteger(value)) throw new Error(`${flag} needs a whole number, got ${JSON.stringify(raw)}`);
  return value;
}

function readFlags(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (BOOLEAN_FLAGS.includes(flag)) flags.set(flag, true);
    else if (VALUE_FLAGS.includes(flag)) flags.set(flag, argv[++index]);
    else throw new Error(`unknown argument ${flag}`);
  }
  return flags;
}

function chosenArms(flags) {
  if (!flags.has('--arms')) return KNOWN_ARMS;
  const arms = flags.get('--arms')?.split(',').filter(Boolean) ?? [];
  const unknown = arms.filter((arm) => !KNOWN_ARMS.includes(arm));
  if (arms.length === 0 || unknown.length > 0) throw new Error(`--arms must list ${KNOWN_ARMS.join(', ')}, got ${unknown.join(', ') || 'nothing'}`);
  return arms;
}

function chosenCaseNames(flags) {
  if (!flags.has('--cases')) return null;
  const names = flags.get('--cases')?.split(',').filter(Boolean) ?? [];
  if (names.length === 0) throw new Error('--cases needs case names, such as --cases a,b');
  return names;
}

function chosenPromptMode(flags) {
  const mode = flags.has('--prompt-mode') ? flags.get('--prompt-mode') : PROMPT_MODES[0];
  if (!PROMPT_MODES.includes(mode)) throw new Error(`--prompt-mode must be ${PROMPT_MODES.join(' or ')}, got ${mode === undefined ? 'nothing' : JSON.stringify(mode)}`);
  return mode;
}

export function parseArguments(argv) {
  const flags = readFlags(argv);
  const value = (flag, read, fallback) => (flags.has(flag) ? read(flags.get(flag), flag) : fallback);
  return {
    quick: !flags.has('--full'),
    dryRun: flags.has('--dry-run'),
    fresh: flags.has('--fresh'),
    validate: flags.has('--validate'),
    report: flags.has('--report'),
    caseNames: chosenCaseNames(flags),
    runs: value('--runs', positiveInteger, DEFAULT_RUNS),
    arms: chosenArms(flags),
    beforePlugin: flags.has('--before-plugin') ? flags.get('--before-plugin') : null,
    maxBudgetUsd: value('--max-budget-usd', positiveNumber, DEFAULT_MAX_BUDGET_USD),
    maxTotalUsd: value('--max-total-usd', parseSpendCap, null),
    concurrency: value('--concurrency', positiveInteger, DEFAULT_CONCURRENCY),
    promptMode: chosenPromptMode(flags)
  };
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
}

function readCase(directory) {
  const slug = path.basename(directory);
  const spec = JSON.parse(fs.readFileSync(path.join(directory, 'case.json'), 'utf8'));
  if (!KINDS.includes(spec.kind)) throw new Error(`${slug}/case.json: kind must be ${KINDS.join(', ')}`);
  if (!TIERS.includes(spec.tier)) throw new Error(`${slug}/case.json: tier must be ${TIERS.join(' or ')}`);
  requireText(spec.repro, `${slug}/case.json: repro`);
  if (spec.kind === 'regression') requireText(spec.culprit, `${slug}/case.json: culprit`);
  else if (spec.culprit !== null) throw new Error(`${slug}/case.json: culprit must be null for kind ${spec.kind}`);
  if (!(spec.timeoutMinutes > 0)) throw new Error(`${slug}/case.json: timeoutMinutes must be a positive number`);
  const flakyRuns = spec.flakyRuns ?? DEFAULT_FLAKY_RUNS;
  if (!Number.isInteger(flakyRuns) || flakyRuns < 1) throw new Error(`${slug}/case.json: flakyRuns must be a positive integer`);
  if (!fs.existsSync(path.join(directory, 'build.mjs'))) throw new Error(`${slug}: build.mjs is missing`);
  return { ...spec, flakyRuns, slug, directory, prompt: fs.readFileSync(path.join(directory, 'prompt.md'), 'utf8') };
}

export function loadCases(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'case.json')))
    .map((entry) => readCase(path.join(root, entry.name)))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export function selectCases(cases, { quick, caseNames }) {
  if (caseNames !== null) {
    const missing = caseNames.filter((name) => !cases.some((spec) => spec.slug === name));
    if (missing.length > 0) throw new Error(`--cases names no such case: ${missing.join(', ')}`);
    return cases.filter((spec) => caseNames.includes(spec.slug));
  }
  return quick ? cases.filter((spec) => spec.tier === 'quick') : cases;
}

export function planCells(cases, arms, runs) {
  const runNumbers = Array.from({ length: runs }, (_, index) => index + 1);
  return runNumbers.flatMap((run) => cases.flatMap((spec) => arms.map((arm) => ({ spec, arm, run }))));
}

export function recordKey({ case: name, arm, run, beforeSha, afterSha, promptMode }) {
  return [name, arm, run, beforeSha, afterSha, promptMode ?? 'natural'].join('|');
}

export function pendingCells(cells, records, shas, promptMode) {
  const recorded = new Set(records.map(recordKey));
  return cells.filter(({ spec, arm, run }) => !recorded.has(recordKey({ case: spec.slug, arm, run, beforeSha: shas.before, afterSha: shas.after, promptMode })));
}

export function spendCap(options, pending) {
  if (options.maxTotalUsd !== null) return options.maxTotalUsd;
  if (options.quick) return QUICK_MAX_TOTAL_USD;
  return Math.round(pending.length * CELL_ESTIMATE_USD * 100) / 100;
}

export function readRecords(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function appendRecord(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

export function latestRecords(records) {
  return [...new Map(records.map((record) => [recordKey(record), record])).values()];
}

export function scopeRecords(records, shas, { caseNames, arms, runs, promptMode }) {
  return latestRecords(records).filter((record) => record.beforeSha === shas.before && record.afterSha === shas.after
    && (record.promptMode ?? 'natural') === promptMode
    && (caseNames === null || caseNames.includes(record.case))
    && arms.includes(record.arm)
    && record.run <= runs);
}

function parseStreamLines(text) {
  return text.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assistantParts(message) {
  const content = message?.message?.content;
  return message?.type === 'assistant' && Array.isArray(content) ? content : [];
}

function ranBisect(message) {
  return assistantParts(message).some((part) => part.type === 'tool_use' && part.name === 'Bash' && BISECT_COMMAND.test(part.input?.command ?? ''));
}

function messageTexts(message) {
  const content = message?.message?.content;
  if (typeof content === 'string') return [content];
  return Array.isArray(content) ? content.map((part) => part.text ?? '').filter((text) => typeof text === 'string') : [];
}

function firedFindCause(message) {
  if (message.type === 'user' && messageTexts(message).some((text) => COMMAND_EXPANSION.test(text))) return true;
  return assistantParts(message).some((part) => part.type === 'tool_use'
    && ((part.name === 'Skill' && /find-cause/.test(part.input?.skill ?? ''))
      || JSON.stringify(part.input ?? {}).includes(FIND_CAUSE_PATH)));
}

function numberOrNull(value) {
  return typeof value === 'number' ? value : null;
}

function estimatedCost(messages) {
  const calls = new Map();
  for (const message of messages) {
    const body = message.message;
    if (message.type === 'assistant' && typeof body?.id === 'string' && body.usage) calls.set(body.id, { counts: usageCounts(body.usage), model: body.model });
  }
  if (calls.size === 0) return null;
  const costs = [...calls.values()].map(({ counts, model }) => countsCost(counts, model));
  return costs.includes(null) ? null : costs.reduce((total, cost) => total + cost, 0);
}

export function streamFacts(text) {
  const messages = parseStreamLines(text);
  const result = messages.findLast((message) => message.type === 'result') ?? null;
  const ids = messages.filter((message) => message.type === 'assistant' && typeof message.message?.id === 'string').map((message) => message.message.id);
  return {
    modelTurns: new Set(ids).size,
    bisectRan: messages.some(ranBisect),
    skillFired: messages.some(firedFindCause),
    durationMs: numberOrNull(result?.duration_ms),
    numTurns: numberOrNull(result?.num_turns),
    total_cost_usd: numberOrNull(result?.total_cost_usd),
    estimatedCostUsd: estimatedCost(messages),
    resultSubtype: result?.subtype ?? null,
    reply: typeof result?.result === 'string' ? result.result : null
  };
}

export function causeNamed(reply, { subject, sha }) {
  if (typeof reply !== 'string') return false;
  if (reply.toLowerCase().includes(subject.toLowerCase())) return true;
  const prefixes = reply.toLowerCase().match(new RegExp(`\\b[0-9a-f]{${MIN_SHA_PREFIX},40}\\b`, 'g')) ?? [];
  return prefixes.some((prefix) => sha.startsWith(prefix));
}

export function promptFor(spec, promptMode) {
  return promptMode === 'skill' ? `${SKILL_PREFIX}${spec.prompt}` : spec.prompt;
}

export function claudeArguments({ prompt, options, pluginDir }) {
  return [
    '-p', prompt,
    '--model', MODELS[MODEL],
    '--effort', EFFORT,
    '--output-format', 'stream-json',
    '--verbose',
    '--setting-sources', 'project,local',
    '--strict-mcp-config',
    '--max-budget-usd', String(options.maxBudgetUsd),
    '--plugin-dir', pluginDir
  ];
}

const PLUGIN_PATHS = ['.', ':!benchmarks', ':!tests'];

function commitOf(directory) {
  return execFileSync('git', ['-C', directory, 'log', '-1', '--format=%H', '--', ...PLUGIN_PATHS], { encoding: 'utf8' }).trim();
}

function dirtySuffix(directory) {
  const status = execFileSync('git', ['-C', directory, 'status', '--porcelain', '--untracked-files=no', '--', ...PLUGIN_PATHS], { encoding: 'utf8' });
  return status.trim() === '' ? '' : '-dirty';
}

export function pluginKey(directory) {
  return `${commitOf(directory)}${dirtySuffix(directory)}`;
}

function currentShas(options) {
  const before = options.arms.includes(BEFORE_ARM) ? pluginKey(path.resolve(options.beforePlugin)) : null;
  return { before, after: pluginKey(ROOT) };
}

function latestShas(records) {
  const last = records.at(-1);
  return last === undefined ? { before: null, after: null } : { before: last.beforeSha, after: last.afterSha };
}

function prepareRepo(spec, cellRoot) {
  const repo = buildCase(spec, path.join(cellRoot, 'repo'));
  fs.mkdirSync(path.join(repo, path.dirname(LOCAL_FILE)), { recursive: true });
  fs.writeFileSync(path.join(repo, LOCAL_FILE), `${JSON.stringify(EXO_SETTINGS, null, 2)}\n`);
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), `/${LOCAL_FILE.split(path.sep).join('/')}\n/.exo/\n`);
  return repo;
}

function runSession({ args, repo, cellRoot, tmp, timeoutMs }) {
  return new Promise((resolve) => {
    const run = confinedClaude({ args, roots: [cellRoot, tmp], cwd: repo, tmp });
    const child = spawn(run.command, run.args, {
      cwd: run.cwd,
      env: { ...withoutParentSession(process.env), ...CELL_ENVIRONMENT, ...run.env },
      stdio: ['ignore', 'pipe', 'ignore'],
      detached: true
    });
    let stream = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => { stream += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      resolve({ stream, timedOut });
    };
    child.on('error', finish);
    child.on('close', finish);
  });
}

function streamName({ case: name, arm, run, promptMode }) {
  return `${name}-${arm}-${run}-${promptMode}`;
}

function saveStream(directory, record, stream) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${streamName(record)}.jsonl`), stream);
}

function savedStream(directory, record) {
  const candidates = [streamName(record), ...(record.promptMode === 'skill' ? [`${record.case}-${record.arm}-${record.run}`] : [])];
  const file = candidates.map((name) => path.join(directory, `${name}.jsonl`)).find((candidate) => fs.existsSync(candidate));
  return file === undefined ? null : fs.readFileSync(file, 'utf8');
}

export function withStreamFacts(records, directory) {
  return records.map((record) => {
    const stream = savedStream(directory, record);
    if (stream === null) return record;
    const { bisectRan, skillFired } = streamFacts(stream);
    return { ...record, bisectRan, skillFired };
  });
}

export function cellRecord({ cell, shas, facts, wallMs, timedOut, culprit, repo, start, promptMode }) {
  const { spec, arm, run } = cell;
  const green = reproGreen(repo, spec, start);
  const named = spec.kind === 'regression' ? causeNamed(facts.reply, culprit) : null;
  const { reply, estimatedCostUsd, ...measured } = facts;
  const costEstimated = measured.total_cost_usd === null && estimatedCostUsd !== null;
  return {
    case: spec.slug,
    kind: spec.kind,
    arm,
    run,
    beforeSha: shas.before,
    afterSha: shas.after,
    promptMode,
    wallMs,
    ...measured,
    total_cost_usd: costEstimated ? estimatedCostUsd : measured.total_cost_usd,
    costEstimated,
    causeNamed: named,
    reproGreen: green,
    pass: green && named !== false,
    timedOut
  };
}

async function playCell({ cell, setups, options, paths, shas }) {
  const { spec, arm, run } = cell;
  const cellRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bisect-'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bisect-tmp-'));
  try {
    const repo = prepareRepo(spec, cellRoot);
    const start = startCommit(repo);
    const culprit = spec.kind === 'regression' ? { subject: spec.culprit, sha: culpritSha(repo, spec.culprit) } : null;
    const args = claudeArguments({ prompt: promptFor(spec, options.promptMode), options, pluginDir: setups[arm] });
    const started = Date.now();
    const { stream, timedOut } = await runSession({ args, repo, cellRoot, tmp, timeoutMs: spec.timeoutMinutes * 60000 });
    const wallMs = Date.now() - started;
    saveStream(paths.streams, { case: spec.slug, arm, run, promptMode: options.promptMode }, stream);
    return cellRecord({ cell, shas, facts: streamFacts(stream), wallMs, timedOut, culprit, repo, start, promptMode: options.promptMode });
  } finally {
    fs.rmSync(cellRoot, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export async function schedule({ cells, concurrency, estimate, cap, play, onRecord }) {
  const running = new Set();
  let spent = 0;
  let next = 0;
  let failure = null;
  const start = (cell) => {
    const task = play(cell).then((record) => {
      spent += cellSpend({ cost: record.total_cost_usd, expected: estimate });
      onRecord(record);
    }, (error) => {
      failure ??= error;
    }).finally(() => running.delete(task));
    running.add(task);
  };
  while ((next < cells.length && failure === null) || running.size > 0) {
    const fits = cellFits({ spent: spent + running.size * estimate, expected: estimate, cap });
    if (next < cells.length && failure === null && running.size < concurrency && fits) start(cells[next++]);
    else if (running.size === 0) break;
    else await Promise.race(running);
  }
  if (failure !== null) throw failure;
  return { spent, skipped: cells.slice(next) };
}

function armSetups(options, scratch) {
  const setups = {};
  if (options.arms.includes(BEFORE_ARM)) setups[BEFORE_ARM] = copyPluginWithoutTasks(path.resolve(options.beforePlugin), path.join(scratch, 'before'));
  if (options.arms.includes('exo')) setups.exo = copyPluginWithoutTasks(ROOT, path.join(scratch, 'exo'));
  return setups;
}

function doneLine(record) {
  const cost = record.total_cost_usd === null ? 'n/a' : `$${record.total_cost_usd.toFixed(2)}`;
  return `done ${record.arm} ${record.case} run ${record.run}: pass ${record.pass}, bisect ${record.bisectRan}, wall ${(record.wallMs / 1000).toFixed(0)}s, cost ${cost}${record.timedOut ? ', timed out' : ''}`;
}

async function runPaid({ pending, options, paths, shas, cap }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bisect-arms-'));
  try {
    const setups = armSetups(options, scratch);
    return await schedule({
      cells: pending,
      concurrency: options.concurrency,
      estimate: CELL_ESTIMATE_USD,
      cap,
      play: (cell) => playCell({ cell, setups, options, paths, shas }),
      onRecord: (record) => {
        appendRecord(paths.records, record);
        console.log(doneLine(record));
      }
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function plannedLines({ pending, recorded, options, cap }) {
  const lines = pending.map(({ spec, arm, run }) => `planned ${arm} ${spec.slug} run ${run}`);
  const projected = pending.length * CELL_ESTIMATE_USD;
  lines.push(`tier ${options.quick ? 'quick' : 'full'}, prompt ${options.promptMode}, ${pending.length} cells (${recorded} already recorded), concurrency ${options.concurrency}, projected $${projected.toFixed(2)} at $${CELL_ESTIMATE_USD} a cell, cap $${cap}, $${options.maxBudgetUsd} a cell`);
  return lines;
}

function publish(records, shas, options, paths) {
  const summaries = {};
  for (const mode of PROMPT_MODES) {
    const scoped = scopeRecords(records, shas, { ...options, promptMode: mode });
    summaries[mode] = scoped.length === 0 ? null : summarize(scoped, shas, mode);
  }
  fs.mkdirSync(path.dirname(paths.summary), { recursive: true });
  fs.writeFileSync(paths.summary, `${JSON.stringify(summaries, null, 2)}\n`);
  for (const summary of Object.values(summaries).filter((entry) => entry !== null)) {
    for (const line of summaryLines(summary)) console.log(line);
  }
}

function validateAll(cases) {
  let failed = 0;
  for (const spec of cases) {
    const problems = validateCase(spec);
    if (problems.length === 0) console.log(`ok ${spec.slug} (${spec.kind})`);
    for (const problem of problems) console.log(`FAIL ${spec.slug}: ${problem}`);
    failed += problems.length === 0 ? 0 : 1;
  }
  console.log(`${cases.length - failed} of ${cases.length} cases valid`);
  return failed === 0 ? 0 : 1;
}

function reportOnly(options, paths) {
  const records = readRecords(paths.records);
  const shas = options.beforePlugin === null ? latestShas(records) : currentShas(options);
  const recomputed = withStreamFacts(records, paths.streams);
  if (scopeRecords(recomputed, shas, { ...options, promptMode: options.promptMode }).length === 0) throw new Error(`no ${options.promptMode} records in ${paths.records} for the before and after commits ${shas.before} and ${shas.after}`);
  publish(recomputed, shas, options, paths);
  return 0;
}

export async function main(argv, paths = defaultPaths()) {
  const options = parseArguments(argv);
  const cases = selectCases(loadCases(paths.cases), options.validate ? { quick: false, caseNames: options.caseNames } : options);
  if (options.validate) return validateAll(cases);
  if (options.report) return reportOnly(options, paths);
  const problem = beforePluginProblem(options.beforePlugin, options.arms);
  if (problem !== null) throw new Error(problem);
  const shas = currentShas(options);
  const recorded = options.fresh ? [] : readRecords(paths.records);
  const cells = planCells(cases, options.arms, options.runs);
  const pending = pendingCells(cells, recorded, shas, options.promptMode);
  const cap = spendCap(options, pending);
  if (options.dryRun) {
    for (const line of plannedLines({ pending, recorded: cells.length - pending.length, options, cap })) console.log(line);
    if (cases.length === 0) console.log(`no cases under ${path.relative(ROOT, paths.cases)}`);
    return 0;
  }
  if (cases.length === 0) throw new Error(`no cases under ${paths.cases}`);
  const outcome = await runPaid({ pending, options, paths, shas, cap });
  for (const cell of outcome.skipped) console.log(`skipped ${cell.arm} ${cell.spec.slug} run ${cell.run}: over --max-total-usd`);
  publish(readRecords(paths.records), shas, { ...options, caseNames: cases.map((spec) => spec.slug) }, paths);
  console.log(`spent about $${outcome.spent.toFixed(2)} of $${cap}`);
  return 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
