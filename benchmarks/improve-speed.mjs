import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evalDefaults, judgeIdea, meanCi, planningVariance, powerLine, tasksNeeded } from '../lib/eval-stats.mjs';
import { parseRows } from './baseline-pool.mjs';
import { projectSweep, sweepProjectionLine } from './sweep-projection.mjs';
import { mean, readJson } from './basics.mjs';
import { NOT_SHOWN } from './speed-ledger.mjs';
import { filesNamed } from './tree-files.mjs';

const CELL_STEPS = readJson(path.join(path.dirname(fileURLToPath(import.meta.url)), 'cell-steps.json'));
const DEFAULT_STEP = 'build-task';
const RELATIVE_EFFECT = 0.1;
const MEASURES = ['pathCalls', 'calls', 'outputTokens', 'fixRounds', 'cost'];
const USAGE = 'usage: node benchmarks/improve-speed.mjs <checkout> | --from <out dir> [--measure pathCalls|calls|outputTokens|fixRounds|cost] [--repeat 15] [--concurrency 5] [--dry-run] [--full] [--base <commit>] [--claude-version <version>] [--pool <file>] [--step <step>] [--base-checkout <checkout>]';
const FAILED_LINE = /^(FAIL|UNPLANNED)/m;
const CELL_ID = 'flow-unit';
const FULL_REPEAT = 15;
const SCREEN_PAIRS = 5;
const SCREEN_CELL = 'flow-web';
const LOOKUP_MODEL = 'claude-sonnet-5-5';
const LOOKUP_EFFORT = 'high';
const UNRECORDED_VERSION = 'unrecorded';
const POOL_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'baseline-pool.mjs');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const DECIMALS = { cost: 3 };
const roundedMean = (values, decimals = 2) => {
  const scale = 10 ** decimals;
  return Math.round(mean(values) * scale) / scale;
};

function readLines(file) {
  const entries = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return entries;
}

function agentOf(entries) {
  const callIds = new Set();
  const times = [];
  for (const entry of entries) {
    if (entry.type === 'assistant' && entry.message?.id && entry.message.usage) callIds.add(entry.message.id);
    const time = Date.parse(entry.timestamp);
    if (Number.isFinite(time)) times.push(time);
  }
  return { entries, callIds, start: Math.min(...times), end: Math.max(...times), children: [] };
}

function subagentFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).sort().filter((name) => name.endsWith('.jsonl'));
}

function subagentOf(directory, name) {
  const agent = agentOf(readLines(path.join(directory, name)));
  const metaFile = path.join(directory, name.replace(/\.jsonl$/, '.meta.json'));
  agent.parent = fs.existsSync(metaFile) ? readJson(metaFile).parentAgentId : undefined;
  return agent;
}

export function loadAgents(transcript) {
  const main = agentOf(readLines(transcript));
  const directory = path.join(transcript.replace(/\.jsonl$/, ''), 'subagents');
  const byId = new Map(subagentFiles(directory).map((name) => [name.slice('agent-'.length, -'.jsonl'.length), subagentOf(directory, name)]));
  for (const agent of byId.values()) (byId.get(agent.parent) ?? main).children.push(agent);
  return { main, all: [main, ...byId.values()] };
}

function overlapGroups(agents) {
  const groups = [];
  for (const agent of [...agents].sort((a, b) => a.start - b.start)) {
    const group = groups.at(-1);
    if (group && agent.start <= group.end) {
      group.agents.push(agent);
      group.end = Math.max(group.end, agent.end);
    } else groups.push({ agents: [agent], end: agent.end });
  }
  return groups.map((group) => group.agents);
}

export function pathCalls(agent) {
  const groups = overlapGroups(agent.children);
  return agent.callIds.size + groups.reduce((sum, group) => sum + Math.max(...group.map(pathCalls)), 0);
}

function toolBlocks(entries) {
  return entries.flatMap((entry) => (Array.isArray(entry.message?.content) ? entry.message.content : []));
}

const isVerifyRun = (block) => block.type === 'tool_use' && block.name === 'Bash' && /(verify|gate)\.mjs/.test(String(block.input?.command));

const resultText = (content) => (Array.isArray(content) ? content.map((part) => part.text ?? '').join('\n') : String(content ?? ''));

export function verifyFailure(main) {
  const blocks = toolBlocks(main.entries);
  const last = blocks.filter(isVerifyRun).at(-1);
  if (!last) return 'verify gate not run';
  const result = blocks.findLast((block) => block.type === 'tool_result' && block.tool_use_id === last.id);
  if (!result || result.is_error || FAILED_LINE.test(resultText(result.content))) return 'verify gate failed';
  return null;
}

function recordFailures(record) {
  const failures = [];
  if (record.exitCode !== 0) failures.push('exit code not 0');
  if (record.timedOut) failures.push('timed out');
  if (record.hiddenPass !== true) failures.push('hidden tests failed');
  if (record.defects?.length) failures.push('defects found');
  if (record.verifyRan !== true) failures.push('verify gate not run');
  return failures;
}

function transcriptFailures(usage) {
  if (!usage?.transcript || !fs.existsSync(usage.transcript)) return { failures: ['transcript missing'] };
  const { main, all } = loadAgents(usage.transcript);
  const gate = verifyFailure(main);
  const calls = new Set(all.flatMap((agent) => [...agent.callIds])).size;
  return { failures: gate ? [gate] : [], calls, pathCalls: pathCalls(main) };
}

export function cellRow(directory) {
  const record = readJson(path.join(directory, 'record.json'));
  const usageFile = path.join(directory, 'usage.json');
  const usage = fs.existsSync(usageFile) ? readJson(usageFile) : null;
  const measured = transcriptFailures(usage);
  const failures = [...recordFailures(record), ...measured.failures];
  const fixRounds = (usage?.subagents ?? []).filter((type) => type === 'exo:fix-review').length;
  return { cell: path.basename(directory), failures: [...new Set(failures)], aborted: record.exitCode !== 0 || record.timedOut === true, hiddenPass: record.hiddenPass, durationMs: record.wallMs, outputTokens: record.outputTokens, cost: record.costUsd ?? undefined, fixRounds, calls: measured.calls, pathCalls: measured.pathCalls };
}

function measureSpread(rows, name) {
  const finished = rows.filter((row) => !row.aborted);
  const values = finished.map((row) => row[name]).filter(Number.isFinite);
  const excluded = rows.length - values.length;
  if (values.length === 0) return { mean: null, se: null, n: 0, excluded };
  const ci = meanCi(values);
  const unscored = name === 'cost' && values.length < finished.length;
  return { mean: unscored ? null : roundedMean(values, DECIMALS[name]), se: ci.se, n: ci.n, excluded };
}

export function scoreOutDir(outDirectory) {
  const cells = fs.readdirSync(outDirectory).sort().map((name) => path.join(outDirectory, name)).filter((directory) => fs.existsSync(path.join(directory, 'record.json')));
  const rows = cells.map(cellRow);
  const spreads = Object.fromEntries(MEASURES.map((name) => [name, measureSpread(rows, name)]));
  const measures = Object.fromEntries(MEASURES.map((name) => [name, spreads[name].mean]));
  return { rows, measures, spreads };
}

function parseArgs(argv) {
  const options = { checkout: null, from: null, measure: 'pathCalls', repeat: null, concurrency: 5, dryRun: false, full: false, base: null, claudeVersion: null, pool: null, step: DEFAULT_STEP, baseCheckout: null };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--from') options.from = argv[++index];
    else if (flag === '--measure') options.measure = argv[++index];
    else if (flag === '--repeat') options.repeat = Number(argv[++index]);
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--full') options.full = true;
    else if (flag === '--base') options.base = argv[++index];
    else if (flag === '--claude-version') options.claudeVersion = argv[++index];
    else if (flag === '--step') options.step = argv[++index];
    else if (flag === '--pool') options.pool = argv[++index];
    else if (flag === '--base-checkout') options.baseCheckout = argv[++index];
    else if (flag === '--concurrency') options.concurrency = Number(argv[++index]);
    else options.checkout = flag;
  }
  options.repeat ??= options.full ? FULL_REPEAT : 1;
  return options;
}

function runSweep(options, cell = CELL_ID) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-improve-speed-'));
  const out = path.join(tmp, 'runs');
  const log = path.join(tmp, 'sweep.log');
  const descriptor = fs.openSync(log, 'w');
  const checkout = path.resolve(options.checkout);
  const args = [path.join(checkout, 'benchmarks', 'sweep.mjs'), '--set', 'flow', '--cells', cell, '--repeat', String(options.repeat), '--concurrency', String(options.concurrency), '--confirm', '--out', out, '--results', path.join(tmp, 'results')];
  spawnSync(process.execPath, args, { stdio: ['ignore', descriptor, descriptor] });
  fs.closeSync(descriptor);
  console.log(`log ${log}`);
  console.log(`out ${out}`);
  return out;
}

function projectRun(options) {
  const runs = path.join(path.resolve(options.checkout ?? ROOT), 'benchmarks', 'runs');
  const cellIds = Array.from({ length: options.repeat }, () => CELL_ID);
  console.log(sweepProjectionLine(projectSweep(cellIds, runs), cellIds.length));
  return 0;
}

const checkoutOf = (options) => path.resolve(options.checkout ?? ROOT);

function mergeBase(checkout) {
  const run = spawnSync('git', ['merge-base', 'HEAD', 'main'], { cwd: checkout, encoding: 'utf8' });
  return run.status === 0 ? run.stdout.trim() : null;
}

function installedClaudeVersion() {
  const run = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  const version = run.status === 0 ? run.stdout.trim().split(/\s+/)[0] : '';
  return version || UNRECORDED_VERSION;
}

function spreadOf(costs) {
  const { se } = meanCi(costs);
  return se === null ? null : Math.round(se * 1000) / 1000;
}

function lookupBase(options) {
  const commit = options.base ?? mergeBase(checkoutOf(options));
  if (!commit) return { error: 'no base commit: git merge-base HEAD main failed; pass --base <commit>' };
  const args = [POOL_SCRIPT, 'lookup', '--metric', 'cost', '--commit', commit, '--cell', CELL_ID, '--model', LOOKUP_MODEL, '--effort', LOOKUP_EFFORT, '--claude-version', options.claudeVersion ?? installedClaudeVersion()];
  if (options.pool) args.push('--pool', options.pool);
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (run.status === 1) return { error: `no pooled base for commit ${commit}; add its results with node benchmarks/baseline-pool.mjs add` };
  if (run.status !== 0) return { error: run.stderr.trim() };
  const row = JSON.parse(run.stdout);
  const costs = parseRows(fs.readFileSync(path.resolve(ROOT, row.results), 'utf8'), row.arm).map((entry) => entry['cost $']);
  if (costs.length === 0) return { error: `pooled base ${commit} has no cost rows in ${row.results}` };
  return { base: { commit, n: costs.length, costs, se: spreadOf(costs), mean: roundedMean(costs, DECIMALS.cost), max: Math.max(...costs) } };
}

export function routeOf(step) {
  if (CELL_STEPS[CELL_ID]?.[step]) return 'pool';
  if (Object.values(CELL_STEPS).some((steps) => steps[step])) return 'screen';
  return null;
}

function costPower({ costs, runs }) {
  if (costs.length < 2) return { powerLine: null, runsNeeded: null };
  const items = Object.fromEntries(costs.map((cost, index) => [index, [cost]]));
  const scores = { base: items, candidate: items };
  const effect = roundedMean(costs, DECIMALS.cost) * RELATIVE_EFFECT;
  const plannedEffect = Math.round(effect * 1000) / 1000;
  const variance = planningVariance({ scores });
  return { powerLine: powerLine({ tasks: runs, scores, effect: plannedEffect }), runsNeeded: tasksNeeded({ variance, effect: plannedEffect }) };
}

const armSpend = (row, pairCostUsd) => (Number.isFinite(row.cost) ? row.cost : pairCostUsd / 2);

const passedChecks = (row) => (row.failures ?? []).length === 0;

export function screenIdea({ step, runArm, pairCostUsd, measure = 'pathCalls', capUsd = evalDefaults().ideaScreenCapUsd }) {
  const record = { route: 'screen', step, cell: SCREEN_CELL, n: SCREEN_PAIRS, measure, capUsd, pairCostUsd, pairs: [], spendUsd: 0, stopped: null, verdict: NOT_SHOWN };
  if (capUsd === 0) return { ...record, stopped: 'off' };
  if (!Number.isFinite(pairCostUsd)) return { ...record, stopped: 'no-estimate' };
  if (SCREEN_PAIRS * pairCostUsd > capUsd) return { ...record, stopped: 'cap' };
  for (let seed = 1; seed <= SCREEN_PAIRS; seed++) {
    if (record.spendUsd + pairCostUsd > capUsd) return { ...record, stopped: 'cap' };
    const base = runArm('base', seed);
    const candidate = runArm('candidate', seed);
    record.spendUsd += armSpend(base, pairCostUsd) + armSpend(candidate, pairCostUsd);
    record.pairs.push({ seed, base: base[measure], candidate: candidate[measure], candidatePassed: passedChecks(candidate) });
  }
  const pairs = record.pairs.map((pair) => [pair.base, pair.candidate]);
  const checksPassed = record.pairs.every((pair) => pair.candidatePassed);
  return { ...record, verdict: judgeIdea({ pairs, checksPassed }).verdict };
}

function screenRecord({ step, runArm, costs = [], capUsd, measure }) {
  const pairCostUsd = costs.length ? roundedMean(costs, DECIMALS.cost) * 2 : null;
  const power = costPower({ costs, runs: SCREEN_PAIRS });
  return { ...screenIdea({ step, runArm, pairCostUsd, measure, capUsd }), ...power };
}

function poolVerdict(row, base) {
  const cost = row.cost ?? null;
  const regressed = row.failures.length > 0 || (cost !== null && cost > base.max);
  return regressed ? 'worse' : NOT_SHOWN;
}

export function verdictRecord({ row, base, step, runs = 1, screen = {} }) {
  const route = routeOf(step);
  if (route === null) throw new RangeError(`step ${step} is in no cell of cell-steps.json`);
  if (route === 'screen') return screenRecord({ step, ...screen });
  const { costs, ...baseSummary } = base;
  const power = costPower({ costs, runs });
  return { route, verdict: poolVerdict(row, base), ...power, step, hiddenPass: row.hiddenPass === true, cost_usd: row.cost ?? null, durationMs: row.durationMs ?? null, base: baseSummary };
}

function flowWebCosts(checkout) {
  const runs = path.join(checkout, 'benchmarks', 'runs');
  if (!fs.existsSync(runs)) return [];
  const records = filesNamed(runs, 'record.json').map((file) => readJson(path.join(runs, file)));
  return records.filter((record) => record?.id === SCREEN_CELL && Number.isFinite(record.costUsd)).map((record) => record.costUsd);
}

function mainCheckout(checkout) {
  const run = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: checkout, encoding: 'utf8' });
  return run.status === 0 ? path.dirname(run.stdout.trim()) : checkout;
}

function sweepArm(options) {
  const candidate = checkoutOf(options);
  const checkouts = { base: options.baseCheckout ?? mainCheckout(candidate), candidate };
  return (arm) => {
    const out = runSweep({ ...options, checkout: checkouts[arm], repeat: 1 }, SCREEN_CELL);
    const { rows } = fs.existsSync(out) ? scoreOutDir(out) : { rows: [] };
    return rows[0] ?? { failures: ['no cell recorded'] };
  };
}

function runScreen(options) {
  const screen = { runArm: sweepArm(options), costs: flowWebCosts(checkoutOf(options)), measure: options.measure };
  const record = verdictRecord({ step: options.step, screen });
  console.log(`verdict ${record.verdict}`);
  console.log(JSON.stringify(record));
  if (record.powerLine) console.log(record.powerLine);
  return record.verdict === 'worse' ? 1 : 0;
}

const spreadText = ({ se, n, excluded }) => `${se === null ? 'no SE' : `se ${se.toFixed(3)}`} n ${n} excluded ${excluded}`;

function printMeasures(measures, measure, spreads) {
  for (const name of MEASURES) console.log(`measure ${name} ${measures[name]} ${spreadText(spreads[name])}`);
  console.log(`score: ${measures[measure]}`);
}

function printBase(base) {
  console.log(`base cost ${base.mean} ${base.se === null ? 'no SE' : `se ${base.se}`} n ${base.n}`);
}

function runQuick(options) {
  if (routeOf(options.step) === 'screen') return runScreen(options);
  const { base, error } = lookupBase(options);
  if (error) {
    console.error(error);
    return 2;
  }
  const out = options.from ?? runSweep(options);
  const { rows, measures, spreads } = fs.existsSync(out) ? scoreOutDir(out) : { rows: [] };
  if (rows.length === 0) {
    console.log('FAIL no cells');
    return 1;
  }
  const screened = verdictRecord({ row: rows[0], base, step: options.step, runs: options.repeat });
  for (const reason of rows[0].failures) console.log(`FAIL ${rows[0].cell} ${reason}`);
  console.log(`verdict ${screened.verdict}`);
  console.log(JSON.stringify(screened));
  console.log(screened.powerLine);
  printBase(base);
  printMeasures(measures, options.measure, spreads);
  return screened.verdict === 'worse' ? 1 : 0;
}

function main(argv) {
  const options = parseArgs(argv);
  if (!MEASURES.includes(options.measure) || !routeOf(options.step) || (!options.from && !options.checkout && !options.dryRun)) {
    console.error(USAGE);
    return 2;
  }
  if (options.dryRun) return projectRun(options);
  if (!options.full) return runQuick(options);
  const out = options.from ?? runSweep(options);
  const { rows, measures, spreads } = fs.existsSync(out) ? scoreOutDir(out) : { rows: [], measures: {} };
  const failures = rows.flatMap((row) => row.failures.map((reason) => `FAIL ${row.cell} ${reason}`));
  if (rows.length === 0) failures.push('FAIL no cells');
  if (!options.from && rows.length < options.repeat) failures.push(`FAIL sweep ${rows.length} of ${options.repeat} cells recorded`);
  if (failures.length) {
    console.log(failures.join('\n'));
    return 1;
  }
  console.log(JSON.stringify({ mode: 'full', measures }));
  printMeasures(measures, options.measure, spreads);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
