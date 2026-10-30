#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confineRefusal } from '#confine-claude';
import { makeDefaultOptionsHome } from '#default-options-home';
import { EFFORTS, readKindTable } from '#model-kinds';
import { UsageError, parseFlags, isMain, environmentMs } from '#script-flags';
import { usageCounts } from '#token-weights';
import { claudeSession, fixtureFiles, gradedSession, inPool, readFixture, runAgent } from './locate-recall.mjs';
import { countsCost } from './pricing.mjs';
import { dispatchLine, gradeRepair, loadFixtures, loadPlants, overlaps, parseFindings, parseRange, prepareCase } from './review-replay.mjs';
import { MODELS } from './tasks.mjs';
import { RESULT_FILE } from './agent-tier/orchestrator/grade.mjs';
import { transcriptChecks, transcriptFindings } from './agent-tier/orchestrator/transcript.mjs';
import { installStub } from './agent-tier/task-runner/install-stub.mjs';
import { taskRunnerChecks, taskRunnerFindings, taskRunnerPrompt } from './agent-tier/task-runner/transcript.mjs';
import { copyPluginWithoutTasks, loadValueTasks, prepareValueRepo, scoreValueRepo } from './value.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = path.join(ROOT, 'benchmarks/agent-tier/agents.json');
const REVIEW_ROOT = path.join(ROOT, 'benchmarks/agent-tier/review');
const AGENT_VALUE_ROOT = path.join(ROOT, 'benchmarks/agent-tier/value');
const ORCHESTRATOR_ROOT = path.join(ROOT, 'benchmarks/agent-tier/orchestrator');
const TASK_RUNNER_ROOT = path.join(ROOT, 'benchmarks/agent-tier/task-runner');
const RESULTS = path.join(ROOT, 'benchmarks/results');
const SESSION_MS = environmentMs('EXO_AGENT_TIER_SESSION_MS', 600_000);
const MODEL_LADDER = ['haiku', 'sonnet', 'opus'];
const EFFORT_STEPS = [1, 2];
const TIERS = ['quick', 'full'];
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const FIXER_BLOCK = /```text\n([\s\S]*?)\n```/;
const VALUE_PREFIX = /^value-/;
const MS_PER_MINUTE = 60_000;
const WILSON_Z = 1.96;
const API_KEY_SOURCE = 'ANTHROPIC_API_KEY';
const AGENT_ALIASES = { orchestrate: 'orchestrator' };
const USAGE = `usage: agent-tier.mjs [--agent <name>]... [--tier quick|full] [--candidate <model:effort>]... [--max-usd <n>] [--concurrency <n>] [--runs <n>] [--transcripts <dir>] [--dry-run] [--out <file>] [--history <file>]... [--merge] [--require-api-key]
Default: the quick fixtures of every agent in benchmarks/agent-tier/agents.json (locate-code, review-branch, fix-review, build-task, solve-hard, orchestrator, task-runner), each run at its current model and effort from lib/model-kinds.json and at cheaper settings, written to benchmarks/results/agent-tier-quick.json.
Candidates per agent: the current setting; the same model one and two effort steps lower, down to low; one model lower at the current effort. --candidate replaces that list and repeats.
--tier full runs every fixture of each agent and writes benchmarks/results/agent-tier-full.json.
--runs repeats every fixture of every candidate that many times; each cell records the min and max of its per-run mean score and check fraction as its spread.
--dry-run spends nothing and prints the session count, estimated USD and estimated wall time per agent. Each session is estimated from the sessions recorded in --out and every --history file for that agent, model, effort and fixture, else the mean of that setting's per-fixture medians, else the agent profile: its token counts priced at the model's list price times the profile usdScale for model:effort, and its wallS times wallScale. Wall time is the summed session estimates over --concurrency. A history file of the earlier agent key orchestrate counts as orchestrator.
--merge reads the existing --out, appends the new sessions with run numbers after the setting's last recorded run, and recomputes every cell from all sessions, so a later round with --candidate and --runs grows only those cells.
--require-api-key runs the first session alone and reads apiKeySource from its stream-json init line; unless it is ANTHROPIC_API_KEY, no further session starts, nothing is written and the exit code is 1. Every session records its apiKeySource. ANTHROPIC_API_KEY must be set in the caller's environment.
Each cell records wilson95, the Wilson 95% interval of the share of its sessions that passed (score 1; an errored session counts as not passed, a skipped one is left out), and the summary line adds the mean cost and median wall per session.
--max-usd stops starting sessions once spent plus reserved estimates would pass the cap, writes the results so far and exits 1.
Exit codes: 0 done, 1 sessions skipped by --max-usd or failed run, 2 usage error. Defaults: --tier quick, --concurrency 2, --runs 1.`;

const sum = (values) => values.reduce((total, value) => total + value, 0);
const labelOf = ({ model, effort }) => `${model}:${effort}`;
const percent = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);
const failed = (error) => ({ outcome: { error, durationMs: 0 } });

export function parseCandidate(text) {
  const [model, effort, ...rest] = String(text).split(':');
  if (rest.length > 0 || !MODEL_LADDER.includes(model) || !EFFORTS.includes(effort)) {
    throw new UsageError(`--candidate '${text}' needs <model>:<effort> with model ${MODEL_LADDER.join('|')} and effort ${EFFORTS.join('|')}`);
  }
  return { model, effort };
}

export function candidatesFor({ model, effort }) {
  const at = EFFORTS.indexOf(effort);
  const lowerEfforts = EFFORT_STEPS.filter((step) => at - step >= 0).map((step) => ({ model, effort: EFFORTS[at - step] }));
  const lowerModel = MODEL_LADDER[MODEL_LADDER.indexOf(model) - 1];
  return [{ model, effort }, ...lowerEfforts, ...(lowerModel ? [{ model: lowerModel, effort }] : [])];
}

export function settingOf(agent, table) {
  const entry = table.agents[`agents/${agent}.md`];
  if (!entry) throw new UsageError(`agent '${agent}' is not in lib/model-kinds.json`);
  const { model, effort } = table.kinds[entry.kind];
  return { model, effort };
}

export function planJobs({ config, agents, tier, candidates, table, runs = 1 }) {
  const repeats = Array.from({ length: runs }, (_, index) => index + 1);
  return agents.flatMap((agent) => {
    const list = candidates ?? candidatesFor(settingOf(agent, table));
    return repeats.flatMap((run) => list.flatMap((candidate) => config[agent].fixtures[tier].map((fixture) => ({ agent, candidate, fixture, run }))));
  });
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const settingOfJob = (candidate) => (session) => session.model === candidate.model && session.effort === candidate.effort;
const wallOf = (session) => (isNumber(session.durationMs) && session.durationMs > 0 ? session.durationMs / 1000 : null);

function recordedEstimate(own, fixture, measure) {
  const measured = own.map((session) => ({ fixture: session.fixture, value: measure(session) })).filter((entry) => isNumber(entry.value));
  if (measured.length === 0) return null;
  const exact = measured.filter((entry) => fixture !== undefined && entry.fixture === fixture);
  if (exact.length > 0) return median(exact.map((entry) => entry.value));
  const byFixture = new Map();
  for (const entry of measured) byFixture.set(entry.fixture, [...(byFixture.get(entry.fixture) ?? []), entry.value]);
  return mean([...byFixture.values()].map(median));
}

const recordedOwn = (agent, candidate, recorded) => recorded.filter((session) => session.agent === agent && !session.skipped && settingOfJob(candidate)(session));

export function estimateUsd(agent, candidate, recorded, config, fixture) {
  const seen = recordedEstimate(recordedOwn(agent, candidate, recorded), fixture, (session) => session.cost_usd);
  if (seen !== null) return seen;
  const profile = config[agent].profile;
  const priced = countsCost(profile, MODELS[candidate.model]) ?? 0;
  return priced * (profile.usdScale?.[labelOf(candidate)] ?? 1);
}

export function estimateWallS(agent, candidate, recorded, config, fixture) {
  const seen = recordedEstimate(recordedOwn(agent, candidate, recorded), fixture, wallOf);
  if (seen !== null) return seen;
  const profile = config[agent].profile;
  if (!isNumber(profile.wallS)) return null;
  return profile.wallS * (profile.wallScale?.[labelOf(candidate)] ?? 1);
}

export function estimateTotal(jobs, recorded, config) {
  return sum(jobs.map((job) => estimateUsd(job.agent, job.candidate, recorded, config, job.fixture)));
}

export function estimateWallTotalS(jobs, recorded, config, concurrency) {
  const walls = jobs.map((job) => estimateWallS(job.agent, job.candidate, recorded, config, job.fixture));
  if (walls.some((wall) => wall === null)) return null;
  return sum(walls) / Math.max(1, Math.min(concurrency, jobs.length));
}

export function wallText(seconds) {
  if (seconds === null) return 'n/a';
  return seconds < 90 ? `${seconds.toFixed(0)} s` : `${(seconds / 60).toFixed(1)} min`;
}

export function dryRunText(jobs, recorded, config, concurrency = 2) {
  const agents = [...new Set(jobs.map((job) => job.agent))];
  const lines = agents.map((agent) => {
    const own = jobs.filter((job) => job.agent === agent);
    const labels = [...new Set(own.map((job) => labelOf(job.candidate)))].join(' ');
    return `${agent}: ${own.length} sessions, est $${estimateTotal(own, recorded, config).toFixed(2)}, est wall ${wallText(estimateWallTotalS(own, recorded, config, concurrency))} at concurrency ${concurrency} (${labels})`;
  });
  const total = `total: ${jobs.length} sessions, est $${estimateTotal(jobs, recorded, config).toFixed(2)}, est wall ${wallText(estimateWallTotalS(jobs, recorded, config, concurrency))} at concurrency ${concurrency}`;
  return `${[...lines, total, 'note: a recorded session of the same agent, model, effort and fixture in --out or --history wins; else the profile, whose usdScale and wallScale model effort where it lists them'].join('\n')}\n`;
}

export function flaggedShare(plants, findingsText) {
  if (plants.length === 0) return null;
  const flagged = parseFindings(findingsText).filter((finding) => finding.weight === 'defect' || finding.weight === 'concern');
  const hit = plants.filter((plant) => flagged.some((finding) => overlaps({ path: plant.path, ...parseRange(plant.range) }, finding)));
  return hit.length / plants.length;
}

export class Budget {
  constructor(cap) {
    this.cap = cap;
    this.spent = 0;
    this.reserved = 0;
    this.skipped = 0;
  }

  reserve(estimate) {
    if (this.cap !== null && this.spent + this.reserved + estimate > this.cap) {
      this.skipped += 1;
      return false;
    }
    this.reserved += estimate;
    return true;
  }

  settle(estimate, actual) {
    this.reserved -= estimate;
    this.spent += actual ?? estimate;
  }

  message() {
    if (this.skipped === 0) return null;
    return `--max-usd $${this.cap} reached after $${this.spent.toFixed(2)}: ${this.skipped} sessions skipped`;
  }
}

function resultOfStream(text) {
  for (const line of text.split('\n').reverse()) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === 'result') return event;
  }
  return null;
}

export function usageOfStream(text) {
  return resultOfStream(text)?.usage ?? null;
}

const modelUsageCounts = (use) => ({ input: use.inputTokens ?? 0, cacheRead: use.cacheReadInputTokens ?? 0, cache5m: use.cacheCreationInputTokens ?? 0, cache1h: 0, output: use.outputTokens ?? 0 });

export function modelUsageCost(modelUsage) {
  const entries = Object.entries(modelUsage ?? {});
  if (entries.length === 0) return null;
  const costs = entries.map(([id, use]) => countsCost(modelUsageCounts(use), id));
  return costs.every(Number.isFinite) ? sum(costs) : null;
}

export function sessionCost(outcome, model) {
  const result = resultOfStream(outcome.stdout ?? '');
  const usage = result?.usage;
  const priced = modelUsageCost(result?.modelUsage) ?? (usage ? countsCost(usageCounts(usage), MODELS[model]) : null);
  return priced ?? outcome.cost_usd ?? null;
}

export function apiKeySourceOf(stdout) {
  for (const line of String(stdout ?? '').split('\n')) {
    if (!line.includes('"init"')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === 'system' && event.subtype === 'init') return event.apiKeySource ?? null;
  }
  return null;
}

const mean = (values) => (values.length === 0 ? null : sum(values) / values.length);

function runSpread(graded, field) {
  const runs = new Map();
  for (const session of graded) runs.set(session.run ?? 1, [...(runs.get(session.run ?? 1) ?? []), session[field]]);
  const means = [...runs.values()].map(mean).filter((value) => typeof value === 'number');
  return means.length === 0 ? null : { min: Math.min(...means), max: Math.max(...means) };
}

export function wilson95(passes, total) {
  if (total === 0) return null;
  const share = passes / total;
  const z2 = WILSON_Z ** 2;
  const denominator = 1 + z2 / total;
  const centre = (share + z2 / (2 * total)) / denominator;
  const half = (WILSON_Z * Math.sqrt((share * (1 - share)) / total + z2 / (4 * total ** 2))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)].map((bound) => Number(bound.toFixed(4)));
}

export function summarizeCells(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const key = `${session.agent} ${labelOf(session)}`;
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  return [...groups.values()].map((own) => {
    const graded = own.filter((session) => !session.error && !session.skipped && typeof session.score === 'number');
    const attempted = own.filter((session) => !session.skipped);
    const passes = graded.filter((session) => session.score >= 1).length;
    return {
      agent: own[0].agent,
      model: own[0].model,
      effort: own[0].effort,
      sessions: own.length,
      graded: graded.length,
      score: mean(graded.map((session) => session.score)),
      fraction: mean(graded.map((session) => session.fraction ?? session.score)),
      spread: { score: runSpread(graded, 'score'), fraction: runSpread(graded, 'fraction') },
      cost_usd: sum(own.map((session) => session.cost_usd ?? 0)),
      costPerSession: attempted.length === 0 ? null : sum(attempted.map((session) => session.cost_usd ?? 0)) / attempted.length,
      wallS: own.length === 0 ? null : sum(own.map((session) => (session.durationMs ?? 0) / 1000)) / own.length,
      wallMedianS: attempted.length === 0 ? null : median(attempted.map((session) => (session.durationMs ?? 0) / 1000)),
      wilson95: wilson95(passes, attempted.length)
    };
  });
}

const spreadText = (spread) => (spread ? ` (${percent(spread.min)}-${percent(spread.max)})` : '');

const intervalText = (interval) => (interval ? ` wilson95 [${percent(interval[0])}-${percent(interval[1])}]` : '');

export function cellLine(cell, config) {
  const spread = cell.spread ?? {};
  const perSession = cell.costPerSession === null || cell.costPerSession === undefined ? '' : ` $${cell.costPerSession.toFixed(3)}/session`;
  const medianWall = isNumber(cell.wallMedianS) ? ` median ${cell.wallMedianS.toFixed(0)}s` : '';
  return `${cell.agent} ${labelOf(cell)} ${config[cell.agent].metric} ${percent(cell.score)}${spreadText(spread.score)} checks ${percent(cell.fraction)}${spreadText(spread.fraction)} usd $${cell.cost_usd.toFixed(2)}${perSession} wall ${cell.wallS.toFixed(0)}s${medianWall}${intervalText(cell.wilson95)}`;
}

const git = (repository, args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' });

async function inCase(work) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-tier-'));
  const tmp = path.join(base, 'tmp');
  fs.mkdirSync(tmp);
  try {
    return await work(base, tmp);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

function runIn(ctx, job, { prompt, cwd, base, tmp, timeoutMs }) {
  const { model, effort } = job.candidate;
  return runAgent({ prompt, agent: `exo:${job.agent}`, model, effort, cwd, roots: [base], tmp, home: ctx.home, pluginDir: ctx.pluginDir, timeoutMs });
}

const reviewPrompt = (line) => `exo-kind: review-deep\n${line.replace(/^DISPATCH Branch:\s*/, '')}`;

function fixerPrompt(pluginDir, { repository, plan, findings }) {
  const text = fs.readFileSync(path.join(pluginDir, 'skills', 'build', 'review-fixer-prompt.md'), 'utf8').match(FIXER_BLOCK)[1];
  return text
    .replaceAll('<plan path>', () => plan)
    .replaceAll('<root>', () => repository)
    .replaceAll('<base>', () => 'main')
    .replaceAll('<findings path>', () => findings)
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', () => pluginDir);
}

function solutionFiles(task) {
  const solution = path.join(task.directory, 'solution');
  return fs.readdirSync(solution, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== 'DELETE')
    .map((entry) => path.relative(solution, path.join(entry.parentPath ?? entry.path, entry.name)));
}

function briefText(task) {
  const files = solutionFiles(task).map((file) => `\`${file}\``).join(', ');
  return `${task.prompt}\n\nFiles: ${files} | Proof: npm test\n\nReturn: one line\n`;
}

async function locateSession(ctx, job, brief) {
  const { model, effort } = job.candidate;
  const outcome = await claudeSession({ prompt: brief.prompt, model, flags: { agent: 'exo:locate-code', effort }, commit: ctx.locate.commit, home: ctx.home });
  const graded = gradedSession({ brief, model, run: 1, outcome, files: ctx.locate.files });
  return { outcome, score: graded.recall ?? null };
}

function reviewSession(ctx, job, fixture) {
  return inCase(async (base, tmp) => {
    const paths = prepareCase(base, fixture);
    const line = dispatchLine(ctx.pluginDir, paths);
    if (line === null) return failed('no DISPATCH Branch line');
    const outcome = await runIn(ctx, job, { prompt: reviewPrompt(line), cwd: paths.repository, base, tmp });
    const findings = line.match(/\bfindings=(\S+)/)?.[1];
    const text = findings && fs.existsSync(findings) ? fs.readFileSync(findings, 'utf8') : outcome.text ?? '';
    return { outcome, score: flaggedShare(loadPlants(fixture), text) };
  });
}

function plantedFindings(fixture) {
  return `${loadPlants(fixture).map((plant) => `${plant.path}:${plant.range}; defect ${plant.class}; fix`).join('\n')}\n`;
}

function fixSession(ctx, job, fixture) {
  return inCase(async (base, tmp) => {
    const paths = prepareCase(base, fixture);
    const findings = path.join(paths.repository, '.exo', 'review-findings.md');
    const findingsText = plantedFindings(fixture);
    fs.mkdirSync(path.dirname(findings), { recursive: true });
    fs.writeFileSync(findings, findingsText);
    const before = git(paths.repository, ['rev-parse', 'HEAD']).trim();
    const prompt = fixerPrompt(ctx.pluginDir, { ...paths, findings });
    const outcome = await runIn(ctx, job, { prompt, cwd: paths.repository, base, tmp });
    const graded = gradeRepair(loadPlants(fixture), findingsText, git(paths.repository, ['diff', '-U0', before]));
    return { outcome, score: graded.fixed / graded.planted };
  });
}

const NO_TRANSCRIPT = () => ({ findings: [], checks: 0 });

export function valueScore(scored, graded) {
  const defects = scored.defects + graded.findings.length;
  const total = scored.total + graded.checks;
  return {
    score: scored.pass && graded.findings.length === 0 ? 1 : 0,
    fraction: total > 0 ? 1 - defects / total : null,
    detail: [...scored.detail, ...graded.findings]
  };
}

function valueSession(promptOf, { prepare = () => {}, transcript = NO_TRANSCRIPT, pluginOf = (ctx) => ctx.pluginDir } = {}) {
  return (ctx, job, task) => inCase(async (base, tmp) => {
    const repository = path.join(base, 'repo');
    const startTree = prepareValueRepo(task, repository);
    prepare(task, repository);
    const timeoutMs = task.timeoutMinutes * MS_PER_MINUTE;
    const outcome = await runIn({ ...ctx, pluginDir: pluginOf(ctx, task, base) }, job, { prompt: promptOf(task, repository), cwd: repository, base, tmp, timeoutMs });
    if (outcome.error) return { outcome };
    const graded = transcript(task, repository, outcome.stdout);
    const scored = await scoreValueRepo(task, repository, startTree);
    if (scored.harnessError) return failed(`harness: ${scored.harnessError}`);
    return { outcome, ...valueScore(scored, graded) };
  });
}

function writeBrief(task, repository) {
  fs.mkdirSync(path.join(repository, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(repository, '.exo', 'brief.md'), briefText(task));
}

function orchestratorTranscript(task, repository, stdout) {
  const file = path.join(repository, RESULT_FILE);
  const resultText = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  return { findings: transcriptFindings(stdout, resultText, task.transcript), checks: transcriptChecks(task.transcript) };
}

function taskRunnerTranscript(task, repository, stdout) {
  return { findings: taskRunnerFindings(stdout, task.transcript), checks: taskRunnerChecks(task.transcript) };
}

const stubbedPlugin = (ctx, task, base) => installStub({ pluginDir: ctx.pluginDir, fixture: task.directory, destination: path.join(base, 'plugin') });

const checkoutPrompt = (task, repository) => `${task.prompt}\n\nCheckout: ${repository}.`;

const EXECUTORS = {
  'locate-code': locateSession,
  'review-branch': reviewSession,
  'fix-review': fixSession,
  'build-task': valueSession((task, repository) => `Brief: ${repository}/.exo/brief.md. Checkout: ${repository}.`, { prepare: writeBrief }),
  'solve-hard': valueSession(checkoutPrompt),
  orchestrator: valueSession(checkoutPrompt, { transcript: orchestratorTranscript }),
  'task-runner': valueSession(taskRunnerPrompt, { transcript: taskRunnerTranscript, pluginOf: stubbedPlugin })
};

const byFixtureId = (tasks) => new Map(tasks.map((task) => [task.id.replace(VALUE_PREFIX, ''), task]));
const valueFixtures = () => byFixtureId([...loadValueTasks(), ...loadValueTasks(AGENT_VALUE_ROOT)]);
const replayFixtures = () => new Map([...loadFixtures(), ...loadFixtures(REVIEW_ROOT)].map((fixture) => [fixture.id, fixture]));

const FIXTURE_SOURCES = {
  'locate-code': () => new Map(readFixture().briefs.map((brief) => [brief.id, brief])),
  'review-branch': replayFixtures,
  'fix-review': replayFixtures,
  'build-task': valueFixtures,
  'solve-hard': valueFixtures,
  orchestrator: () => byFixtureId(loadValueTasks(ORCHESTRATOR_ROOT)),
  'task-runner': () => byFixtureId(loadValueTasks(TASK_RUNNER_ROOT))
};

export function resolveFixtures(jobs) {
  const sources = {};
  for (const agent of new Set(jobs.map((job) => job.agent))) sources[agent] = FIXTURE_SOURCES[agent]();
  for (const job of jobs) {
    if (!sources[job.agent].has(job.fixture)) throw new UsageError(`${job.agent} fixture '${job.fixture}' is not on disk`);
  }
  return sources;
}

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

export function recordedSessions(file) {
  if (!fs.existsSync(file)) return [];
  const sessions = JSON.parse(fs.readFileSync(file, 'utf8')).sessions ?? [];
  return sessions.map((session) => ({ ...session, agent: AGENT_ALIASES[session.agent] ?? session.agent }));
}

const lastRunOf = (sessions) => Math.max(0, ...sessions.map((session) => session.run ?? 1));

export function offsetRuns(jobs, existing) {
  return jobs.map((job) => {
    const own = existing.filter((session) => session.agent === job.agent && settingOfJob(job.candidate)(session));
    return { ...job, run: (job.run ?? 1) + lastRunOf(own) };
  });
}

export async function runGated(tasks, concurrency, accepts) {
  if (tasks.length === 0) return { sessions: [], refused: null };
  const first = await tasks[0]();
  if (!accepts(first)) return { sessions: [first], refused: first };
  const rest = await inPool(tasks.slice(1), concurrency);
  return { sessions: [first, ...rest], refused: null };
}

export const usesApiKey = (record) => record.skipped === true || record.apiKeySource === API_KEY_SOURCE;

export function refusalText(record) {
  const found = record.apiKeySource ?? 'none (no init line)';
  return `--require-api-key: the first session reported apiKeySource ${found}, not ${API_KEY_SOURCE}; no other session started and nothing was written`;
}

function readFlags(argv, config) {
  const flags = parseFlags(argv, { agent: 'list', tier: 'value', candidate: 'list', 'max-usd': 'value', concurrency: 'value', runs: 'value', transcripts: 'value', 'dry-run': 'boolean', out: 'value', history: 'list', merge: 'boolean', 'require-api-key': 'boolean' }, { usage: USAGE });
  const tier = flags.tier ?? 'quick';
  if (!TIERS.includes(tier)) throw new UsageError(`--tier needs ${TIERS.join(' or ')}, got '${tier}'`);
  if (flags.concurrency !== undefined && !POSITIVE_INTEGER.test(flags.concurrency)) throw new UsageError(`--concurrency needs a positive integer, got '${flags.concurrency}'`);
  if (flags.runs !== undefined && !POSITIVE_INTEGER.test(flags.runs)) throw new UsageError(`--runs needs a positive integer, got '${flags.runs}'`);
  const cap = flags['max-usd'] === undefined ? null : Number(flags['max-usd']);
  if (cap !== null && !(cap > 0)) throw new UsageError(`--max-usd needs a positive number, got '${flags['max-usd']}'`);
  const agents = flags.agent ?? Object.keys(config);
  for (const agent of agents) if (!config[agent]) throw new UsageError(`--agent '${agent}' is not one of ${Object.keys(config).join(', ')}`);
  return {
    agents,
    tier,
    candidates: flags.candidate?.map(parseCandidate) ?? null,
    cap,
    concurrency: Number(flags.concurrency ?? 2),
    runs: Number(flags.runs ?? 1),
    transcripts: flags.transcripts,
    dryRun: flags['dry-run'] === true,
    merge: flags.merge === true,
    requireApiKey: flags['require-api-key'] === true,
    history: flags.history ?? [],
    out: flags.out ?? path.join(RESULTS, `agent-tier-${tier}.json`)
  };
}

function saveTranscript(directory, job, stdout) {
  if (directory === undefined || !stdout) return;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${job.agent}-${job.candidate.model}-${job.candidate.effort}-${job.fixture}-r${job.run ?? 1}.jsonl`), stdout);
}

export function recordOf(job, result) {
  const { outcome, score, fraction, detail } = result;
  const base = { agent: job.agent, model: job.candidate.model, effort: job.candidate.effort, fixture: job.fixture, run: job.run ?? 1, cost_usd: sessionCost(outcome, job.candidate.model), durationMs: outcome.durationMs, numTurns: outcome.numTurns ?? null, apiKeySource: apiKeySourceOf(outcome.stdout) };
  if (outcome.error) return { ...base, error: outcome.error };
  return { ...base, score, fraction: fraction ?? score, ...(detail ? { detail } : {}) };
}

function jobRunner(run) {
  const { ctx, sources, budget, recorded, config, transcripts } = run;
  return (job) => async () => {
    const estimate = estimateUsd(job.agent, job.candidate, recorded, config, job.fixture);
    if (!budget.reserve(estimate)) return { agent: job.agent, model: job.candidate.model, effort: job.candidate.effort, fixture: job.fixture, run: job.run ?? 1, skipped: true };
    const result = await EXECUTORS[job.agent](ctx, job, sources[job.agent].get(job.fixture));
    const record = recordOf(job, result);
    budget.settle(estimate, record.cost_usd);
    saveTranscript(transcripts, job, result.outcome.stdout);
    return record;
  };
}

async function buildContext(jobs, home, pluginRoot) {
  const ctx = { home, pluginDir: copyPluginWithoutTasks(ROOT, path.join(pluginRoot, 'exo')) };
  if (jobs.some((job) => job.agent === 'locate-code')) {
    const fixture = readFixture();
    ctx.locate = { commit: fixture.commit, files: fixtureFiles(fixture.commit) };
  }
  return ctx;
}

function writeResults(flags, sessions, config) {
  const cells = summarizeCells(sessions);
  const result = { tier: flags.tier, runs: lastRunOf(sessions), cells, sessions };
  fs.mkdirSync(path.dirname(flags.out), { recursive: true });
  fs.writeFileSync(flags.out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${cells.map((cell) => cellLine(cell, config)).join('\n')}\nwrote ${flags.out}\n`);
}

const knownSessions = (flags) => [...flags.history.flatMap(recordedSessions), ...recordedSessions(flags.out)];

function requireKey(flags) {
  if (flags.requireApiKey && !process.env[API_KEY_SOURCE]) throw new UsageError(`--require-api-key needs ${API_KEY_SOURCE} set in the environment`);
}

async function runAll(flags, tasks) {
  if (!flags.requireApiKey) return { sessions: await inPool(tasks, flags.concurrency), refused: null };
  return runGated(tasks, flags.concurrency, usesApiKey);
}

async function realRun(flags, plannedJobs, config) {
  requireKey(flags);
  const refusal = confineRefusal();
  if (refusal) throw new UsageError(refusal);
  const prior = flags.merge ? recordedSessions(flags.out) : [];
  const jobs = flags.merge ? offsetRuns(plannedJobs, prior) : plannedJobs;
  const sources = resolveFixtures(jobs);
  const home = makeDefaultOptionsHome({ withoutInstalledPlugins: true });
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-tier-plugin-'));
  const budget = new Budget(flags.cap);
  let refused = null;
  try {
    const ctx = await buildContext(jobs, home, pluginRoot);
    const transcripts = flags.transcripts ?? path.join(ROOT, '.exo', 'agent-tier', new Date().toISOString().replace(/[:.]/g, '-'));
    const runner = jobRunner({ ctx, sources, budget, recorded: knownSessions(flags), config, transcripts });
    const outcome = await runAll(flags, jobs.map(runner));
    refused = outcome.refused;
    if (!refused) writeResults(flags, [...prior, ...outcome.sessions], config);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(pluginRoot, { recursive: true, force: true });
  }
  if (refused) {
    process.stderr.write(`${refusalText(refused)}\n`);
    return 1;
  }
  const message = budget.message();
  if (message) process.stderr.write(`${message}\n`);
  return message ? 1 : 0;
}

async function main() {
  const config = readConfig();
  const flags = readFlags(process.argv.slice(2), config);
  const jobs = planJobs({ config, agents: flags.agents, tier: flags.tier, candidates: flags.candidates, table: readKindTable(), runs: flags.runs });
  if (!flags.dryRun) return realRun(flags, jobs, config);
  process.stdout.write(dryRunText(jobs, knownSessions(flags), config, flags.concurrency));
  return 0;
}

if (isMain(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
