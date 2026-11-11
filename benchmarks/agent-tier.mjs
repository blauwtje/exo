#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confineRefusal } from '#confine-claude';
import { makeDefaultOptionsHome } from '#default-options-home';
import { EFFORTS, readKindTable } from '#model-kinds';
import { UsageError, parseFlags, isMain, environmentMs } from '#script-flags';
import { claudeSession, fixtureFiles, gradedSession, inPool, readFixture, runAgent } from './locate-recall.mjs';
import { dispatchLine, gradeRepair, loadFixtures, loadPlants, prepareCase } from './review-replay.mjs';
import { RESULT_FILE } from './agent-tier/orchestrator/grade.mjs';
import { transcriptChecks, transcriptFindings } from './agent-tier/orchestrator/transcript.mjs';
import { copyPluginWithoutTasks, loadValueTasks, prepareValueRepo, scoreValueRepo } from './value.mjs';
import { median, readJson } from './basics.mjs';
import { dispatchAgent, dispatchPrompt, generalKind } from './agent-tier/dispatch.mjs';
import { settingOfJob, estimateUsd, dryRunText, flaggedShare, Budget, sessionCost, apiKeySourceOf, wilson95, summarizeCells, candidateComparisons, comparisonLine, cellLine } from './agent-tier/estimate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = path.join(ROOT, 'benchmarks/agent-tier/agents.json');
const REVIEW_ROOT = path.join(ROOT, 'benchmarks/agent-tier/review');
const AGENT_VALUE_ROOT = path.join(ROOT, 'benchmarks/agent-tier/value');
const ORCHESTRATOR_ROOT = path.join(ROOT, 'benchmarks/agent-tier/orchestrator');
const OPEN_POINT_BRIEFS = path.join(ROOT, 'benchmarks/agent-tier/find-open-points/briefs.json');
const IDEATE_QUESTIONS = path.join(ROOT, 'benchmarks/agent-tier/ideate/questions.json');
const RESULTS = path.join(ROOT, 'benchmarks/results');
const SESSION_MS = environmentMs('EXO_AGENT_TIER_SESSION_MS', 600_000);
const MODEL_LADDER = ['haiku', 'sonnet', 'opus'];
const EFFORT_STEPS = [1, 2];
const TIERS = ['quick', 'full'];
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const FIXER_BLOCK = /```text\n([\s\S]*?)\n```/;
const VALUE_PREFIX = /^value-/;
const MS_PER_MINUTE = 60_000;
const API_KEY_SOURCE = 'ANTHROPIC_API_KEY';
const AGENT_ALIASES = { orchestrate: 'orchestrator' };
const USAGE = `usage: agent-tier.mjs [--agent <name>]... [--tier quick|full] [--candidate <model:effort>]... [--max-usd <n>] [--concurrency <n>] [--runs <n>] [--transcripts <dir>] [--dry-run] [--out <file>] [--history <file>]... [--merge] [--require-api-key]
Default: the quick fixtures of every agent in benchmarks/agent-tier/agents.json (locate-code, review-branch, fix-review, build-task, solve-hard, orchestrator), each run at its current model and effort from lib/model-kinds.json and at cheaper settings, written to benchmarks/results/agent-tier-quick.json.
Candidates per agent: the current setting; the same model one and two effort steps lower, down to low; one model lower at the current effort. --candidate replaces that list and repeats.
--tier full runs every fixture of each agent and writes benchmarks/results/agent-tier-full.json.
--runs repeats every fixture of every candidate that many times; each cell records its mean score and check fraction with a fixture-clustered SE and 95% interval, and no SE while the sessions cover fewer than two fixtures.
--dry-run spends nothing and prints the session count, estimated USD and estimated wall time per agent. Each session is estimated from the sessions recorded in --out and every --history file for that agent, model, effort and fixture, else the mean of that setting's per-fixture medians, else the agent profile: its token counts priced at the model's list price times the profile usdScale for model:effort, and its wallS times wallScale. Wall time is the summed session estimates over --concurrency. A history file of the earlier agent key orchestrate counts as orchestrator.
--merge reads the existing --out, appends the new sessions with run numbers after the setting's last recorded run, and recomputes every cell from all sessions, so a later round with --candidate and --runs grows only those cells.
--require-api-key runs the first session alone and reads apiKeySource from its stream-json init line; unless it is ANTHROPIC_API_KEY, no further session starts, nothing is written and the exit code is 1. Every session records its apiKeySource. ANTHROPIC_API_KEY must be set in the caller's environment.
Each cell records wilson95, the Wilson 95% interval of the share of its sessions that passed (score 1; an errored session counts as not passed, a skipped one is left out), and the summary line adds the mean cost and median wall per session. An errored session scores 0 and its check fraction is 0; its cost and wall time stay out of the per-session means, and the line prints how many sessions were left out. After the cells, each candidate prints its score minus the agent's current setting, paired per fixture, with SE and 95% interval; the verdict better or worse appears only when the interval clears zero, else noise, and no SE under two shared fixtures.
--max-usd stops starting sessions once spent plus reserved estimates would pass the cap, writes the results so far and exits 1.
Exit codes: 0 done, 1 sessions skipped by --max-usd or failed run, 2 usage error. Defaults: --tier quick, --concurrency 2, --runs 1.`;

const failed = (error) => ({ outcome: { error, durationMs: null } });

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
  const kind = generalKind(agent);
  if (kind) return { model: table.kinds[kind].model, effort: table.kinds[kind].effort };
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
  return runAgent({ prompt: dispatchPrompt(job.agent, prompt), agent: dispatchAgent(job.agent), model, effort, cwd, roots: [base], tmp, home: ctx.home, pluginDir: ctx.pluginDir, timeoutMs });
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
  const outcome = await claudeSession({ prompt: dispatchPrompt(job.agent, brief.prompt), model, flags: { agent: dispatchAgent(job.agent), effort }, commit: ctx.locate.commit, home: ctx.home });
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

const IDEA_LINE = /^.+-\d+: .*\bp=/;

export function ideaBrief(question) {
  return [
    'exo-kind: ideate',
    `Persona: ${question.persona}`,
    `Question: ${question.question}`,
    `Do not propose: ${question.banned.join('; ')}`,
    `Grounding: ${question.grounding}`,
    `Ideas: ${question.ideas}`,
    'Give each idea a title, one sentence and a probability p= that an average answer would say it. At least 3 ideas have p of 0.10 or lower.'
  ].join('\n');
}

export function formatCompliance(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  if (lines.length === 0) return 0;
  return lines.filter((line) => IDEA_LINE.test(line)).length / lines.length;
}

function ideateSession(ctx, job, question) {
  return inCase(async (base, tmp) => {
    const cwd = path.join(base, 'scratch');
    fs.mkdirSync(cwd);
    const outcome = await runIn(ctx, job, { prompt: ideaBrief(question), cwd, base, tmp });
    if (outcome.error) return { outcome };
    return { outcome, score: formatCompliance(outcome.text ?? '') };
  });
}

const OPEN_POINT_LINE = /^\s*(\d+\. \[user\]|Assumptions:)/m;

function openPointsSession(ctx, job, fixture) {
  return inCase(async (base, tmp) => {
    const cwd = path.join(base, 'scratch');
    fs.mkdirSync(path.join(cwd, '.exo'), { recursive: true });
    const briefPath = path.join(cwd, '.exo', 'brief.md');
    fs.writeFileSync(briefPath, fixture.brief);
    const outcome = await runIn(ctx, job, { prompt: `Brief: ${briefPath}`, cwd, base, tmp });
    if (outcome.error) return { outcome };
    const assumptions = path.join(cwd, '.exo', 'open-points', 'assumptions.md');
    const filed = fs.existsSync(assumptions) ? fs.readFileSync(assumptions, 'utf8') : '';
    const text = outcome.text ?? '';
    return { outcome, score: OPEN_POINT_LINE.test(text) ? 1 : 0, detail: { text, assumptions: filed } };
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



const checkoutPrompt = (task, repository) => `${task.prompt}\n\nCheckout: ${repository}.`;

const EXECUTORS = {
  'locate-code': locateSession,
  'review-branch': reviewSession,
  'fix-review': fixSession,
  'general-read': locateSession,
  'general-build': valueSession((task, repository) => `${briefText(task)}\nCheckout: ${repository}.`),
  'ideate-worker': ideateSession,
  'find-open-points': openPointsSession,
  'build-task': valueSession((task, repository) => `Brief: ${repository}/.exo/brief.md. Checkout: ${repository}.`, { prepare: writeBrief }),
  'solve-hard': valueSession(checkoutPrompt),
  orchestrator: valueSession(checkoutPrompt, { transcript: orchestratorTranscript })
};

const byFixtureId = (tasks) => new Map(tasks.map((task) => [task.id.replace(VALUE_PREFIX, ''), task]));
const valueFixtures = () => byFixtureId([...loadValueTasks(), ...loadValueTasks(AGENT_VALUE_ROOT)]);
const replayFixtures = () => new Map([...loadFixtures(), ...loadFixtures(REVIEW_ROOT)].map((fixture) => [fixture.id, fixture]));

const FIXTURE_SOURCES = {
  'locate-code': () => new Map(readFixture().briefs.map((brief) => [brief.id, brief])),
  'review-branch': replayFixtures,
  'fix-review': replayFixtures,
  'general-read': () => new Map(readFixture().briefs.map((brief) => [brief.id, brief])),
  'general-build': valueFixtures,
  'find-open-points': () => new Map(readJson(OPEN_POINT_BRIEFS).map((brief) => [brief.id, brief])),
  'ideate-worker': () => new Map(readJson(IDEATE_QUESTIONS).map((question) => [question.id, question])),
  'build-task': valueFixtures,
  'solve-hard': valueFixtures,
  orchestrator: () => byFixtureId(loadValueTasks(ORCHESTRATOR_ROOT))
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
  return readJson(CONFIG_FILE);
}

export function recordedSessions(file) {
  if (!fs.existsSync(file)) return [];
  const sessions = readJson(file).sessions ?? [];
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
  if (jobs.some((job) => job.agent === 'locate-code' || job.agent === 'general-read')) {
    const fixture = readFixture();
    ctx.locate = { commit: fixture.commit, files: fixtureFiles(fixture.commit) };
  }
  return ctx;
}

function writeResults(flags, sessions, config) {
  const cells = summarizeCells(sessions);
  const comparisons = candidateComparisons(sessions, (agent) => settingOf(agent, readKindTable()));
  const result = { tier: flags.tier, runs: lastRunOf(sessions), cells, comparisons, sessions };
  fs.mkdirSync(path.dirname(flags.out), { recursive: true });
  fs.writeFileSync(flags.out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${[...cells.map((cell) => cellLine(cell, config)), ...comparisons.map(comparisonLine)].join('\n')}\nwrote ${flags.out}\n`);
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
