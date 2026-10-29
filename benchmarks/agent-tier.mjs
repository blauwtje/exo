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
import { claudeSession, fixtureFiles, gradedSession, inPool, medianCost, readFixture, runAgent } from './locate-recall.mjs';
import { countsCost } from './pricing.mjs';
import { dispatchLine, gradeRepair, loadFixtures, loadPlants, overlaps, parseFindings, parseRange, prepareCase } from './review-replay.mjs';
import { MODELS } from './tasks.mjs';
import { copyPluginWithoutTasks, loadValueTasks, prepareValueRepo, scoreValueRepo } from './value.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = path.join(ROOT, 'benchmarks/agent-tier/agents.json');
const RESULTS = path.join(ROOT, 'benchmarks/results');
const SESSION_MS = environmentMs('EXO_AGENT_TIER_SESSION_MS', 600_000);
const MODEL_LADDER = ['haiku', 'sonnet', 'opus'];
const EFFORT_STEPS = [1, 2];
const TIERS = ['quick', 'full'];
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const FIXER_BLOCK = /```text\n([\s\S]*?)\n```/;
const VALUE_PREFIX = /^value-/;
const MS_PER_MINUTE = 60_000;
const USAGE = `usage: agent-tier.mjs [--agent <name>]... [--tier quick|full] [--candidate <model:effort>]... [--max-usd <n>] [--concurrency <n>] [--transcripts <dir>] [--dry-run] [--out <file>]
Default: the quick fixtures of every agent in benchmarks/agent-tier/agents.json (locate-code, review-branch, fix-review, build-task, solve-hard), each run at its current model and effort from lib/model-kinds.json and at cheaper settings, written to benchmarks/results/agent-tier-quick.json.
Candidates per agent: the current setting; the same model one and two effort steps lower, down to low; one model lower at the current effort. --candidate replaces that list and repeats.
--tier full runs every fixture of each agent and writes benchmarks/results/agent-tier-full.json.
--dry-run spends nothing and prints the session count and estimated USD per agent: the median cost recorded in --out for that agent, model and effort, else the agent profile priced at the model's list price. Effort is not modeled in profile estimates.
--max-usd stops starting sessions once spent plus reserved estimates would pass the cap, writes the results so far and exits 1.
Exit codes: 0 done, 1 sessions skipped by --max-usd or failed run, 2 usage error. Defaults: --tier quick, --concurrency 2.`;

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

export function planJobs({ config, agents, tier, candidates, table }) {
  return agents.flatMap((agent) => {
    const list = candidates ?? candidatesFor(settingOf(agent, table));
    return list.flatMap((candidate) => config[agent].fixtures[tier].map((fixture) => ({ agent, candidate, fixture })));
  });
}

export function estimateUsd(agent, candidate, recorded, config) {
  const own = recorded.filter((session) => session.agent === agent && session.model === candidate.model && session.effort === candidate.effort);
  const median = medianCost(own);
  if (median !== null) return median;
  return countsCost(config[agent].profile, MODELS[candidate.model]) ?? 0;
}

export function estimateTotal(jobs, recorded, config) {
  return sum(jobs.map((job) => estimateUsd(job.agent, job.candidate, recorded, config)));
}

export function dryRunText(jobs, recorded, config) {
  const agents = [...new Set(jobs.map((job) => job.agent))];
  const lines = agents.map((agent) => {
    const own = jobs.filter((job) => job.agent === agent);
    const labels = [...new Set(own.map((job) => labelOf(job.candidate)))].join(' ');
    return `${agent}: ${own.length} sessions, est $${estimateTotal(own, recorded, config).toFixed(2)} (${labels})`;
  });
  const total = `total: ${jobs.length} sessions, est $${estimateTotal(jobs, recorded, config).toFixed(2)}`;
  return `${[...lines, total, 'note: profile estimates do not model effort; a recorded median in --out does'].join('\n')}\n`;
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

export function usageOfStream(text) {
  for (const line of text.split('\n').reverse()) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === 'result') return event.usage ?? null;
  }
  return null;
}

export function sessionCost(outcome, model) {
  const usage = usageOfStream(outcome.stdout ?? '');
  const priced = usage ? countsCost(usageCounts(usage), MODELS[model]) : null;
  return priced ?? outcome.cost_usd ?? null;
}

export function summarizeCells(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const key = `${session.agent} ${labelOf(session)}`;
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  return [...groups.values()].map((own) => {
    const graded = own.filter((session) => !session.error && !session.skipped && typeof session.score === 'number');
    return {
      agent: own[0].agent,
      model: own[0].model,
      effort: own[0].effort,
      sessions: own.length,
      graded: graded.length,
      score: graded.length === 0 ? null : sum(graded.map((session) => session.score)) / graded.length,
      cost_usd: sum(own.map((session) => session.cost_usd ?? 0)),
      wallS: own.length === 0 ? null : sum(own.map((session) => (session.durationMs ?? 0) / 1000)) / own.length
    };
  });
}

export function cellLine(cell, config) {
  return `${cell.agent} ${labelOf(cell)} ${config[cell.agent].metric} ${percent(cell.score)} usd $${cell.cost_usd.toFixed(2)} wall ${cell.wallS.toFixed(0)}s`;
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

function valueSession(promptOf, prepare = () => {}) {
  return (ctx, job, task) => inCase(async (base, tmp) => {
    const repository = path.join(base, 'repo');
    const startTree = prepareValueRepo(task, repository);
    prepare(task, repository);
    const timeoutMs = task.timeoutMinutes * MS_PER_MINUTE;
    const outcome = await runIn(ctx, job, { prompt: promptOf(task, repository), cwd: repository, base, tmp, timeoutMs });
    if (outcome.error) return { outcome };
    const scored = await scoreValueRepo(task, repository, startTree);
    if (scored.harnessError) return failed(`harness: ${scored.harnessError}`);
    return { outcome, score: scored.pass ? 1 : 0 };
  });
}

function writeBrief(task, repository) {
  fs.mkdirSync(path.join(repository, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(repository, '.exo', 'brief.md'), briefText(task));
}

const EXECUTORS = {
  'locate-code': locateSession,
  'review-branch': reviewSession,
  'fix-review': fixSession,
  'build-task': valueSession((task, repository) => `Brief: ${repository}/.exo/brief.md. Checkout: ${repository}.`, writeBrief),
  'solve-hard': valueSession((task, repository) => `${task.prompt}\n\nCheckout: ${repository}.`)
};

const valueFixtures = () => new Map(loadValueTasks().map((task) => [task.id.replace(VALUE_PREFIX, ''), task]));
const replayFixtures = () => new Map(loadFixtures().map((fixture) => [fixture.id, fixture]));

const FIXTURE_SOURCES = {
  'locate-code': () => new Map(readFixture().briefs.map((brief) => [brief.id, brief])),
  'review-branch': replayFixtures,
  'fix-review': replayFixtures,
  'build-task': valueFixtures,
  'solve-hard': valueFixtures
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

function recordedSessions(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).sessions ?? [];
}

function readFlags(argv, config) {
  const flags = parseFlags(argv, { agent: 'list', tier: 'value', candidate: 'list', 'max-usd': 'value', concurrency: 'value', transcripts: 'value', 'dry-run': 'boolean', out: 'value' }, { usage: USAGE });
  const tier = flags.tier ?? 'quick';
  if (!TIERS.includes(tier)) throw new UsageError(`--tier needs ${TIERS.join(' or ')}, got '${tier}'`);
  if (flags.concurrency !== undefined && !POSITIVE_INTEGER.test(flags.concurrency)) throw new UsageError(`--concurrency needs a positive integer, got '${flags.concurrency}'`);
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
    transcripts: flags.transcripts,
    dryRun: flags['dry-run'] === true,
    out: flags.out ?? path.join(RESULTS, `agent-tier-${tier}.json`)
  };
}

function saveTranscript(directory, job, stdout) {
  if (directory === undefined || !stdout) return;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${job.agent}-${job.candidate.model}-${job.candidate.effort}-${job.fixture}.jsonl`), stdout);
}

function recordOf(job, result) {
  const { outcome, score } = result;
  const base = { agent: job.agent, model: job.candidate.model, effort: job.candidate.effort, fixture: job.fixture, cost_usd: sessionCost(outcome, job.candidate.model), durationMs: outcome.durationMs, numTurns: outcome.numTurns ?? null };
  return outcome.error ? { ...base, error: outcome.error } : { ...base, score };
}

function jobRunner(run) {
  const { ctx, sources, budget, recorded, config, transcripts } = run;
  return (job) => async () => {
    const estimate = estimateUsd(job.agent, job.candidate, recorded, config);
    if (!budget.reserve(estimate)) return { agent: job.agent, model: job.candidate.model, effort: job.candidate.effort, fixture: job.fixture, skipped: true };
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
  const result = { tier: flags.tier, cells, sessions };
  fs.mkdirSync(path.dirname(flags.out), { recursive: true });
  fs.writeFileSync(flags.out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${cells.map((cell) => cellLine(cell, config)).join('\n')}\nwrote ${flags.out}\n`);
}

async function realRun(flags, jobs, config) {
  const refusal = confineRefusal();
  if (refusal) throw new UsageError(refusal);
  const sources = resolveFixtures(jobs);
  const home = makeDefaultOptionsHome({ withoutInstalledPlugins: true });
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-tier-plugin-'));
  const budget = new Budget(flags.cap);
  try {
    const ctx = await buildContext(jobs, home, pluginRoot);
    const transcripts = flags.transcripts ?? path.join(ROOT, '.exo', 'agent-tier', new Date().toISOString().replace(/[:.]/g, '-'));
    const runner = jobRunner({ ctx, sources, budget, recorded: recordedSessions(flags.out), config, transcripts });
    const sessions = await inPool(jobs.map(runner), flags.concurrency);
    writeResults(flags, sessions, config);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(pluginRoot, { recursive: true, force: true });
  }
  const message = budget.message();
  if (message) process.stderr.write(`${message}\n`);
  return message ? 1 : 0;
}

async function main() {
  const config = readConfig();
  const flags = readFlags(process.argv.slice(2), config);
  const jobs = planJobs({ config, agents: flags.agents, tier: flags.tier, candidates: flags.candidates, table: readKindTable() });
  if (!flags.dryRun) return realRun(flags, jobs, config);
  process.stdout.write(dryRunText(jobs, recordedSessions(flags.out), config));
  return 0;
}

if (isMain(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
