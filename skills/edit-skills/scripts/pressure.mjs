#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { confineRefusal, confinedClaude } from '#confine-claude';
import { makeDefaultOptionsHome } from '#default-options-home';
import { BUDGETS, readKindTable } from '#model-kinds';
import { comparisonArm, installedPluginId, loadedSkillDirs, resolvePluginDir, wrongCopies } from '#plugin-copy';
import { UsageError, parseFlags, isMain } from '#script-flags';
import { DEFAULT_MARGIN, JUDGE_VOTES, aggregate, defaultJudge, gradeRun, linesForCase, parseCriteria, parseMargins } from './pressure-grade.mjs';

const TIMEOUT_MS = 1_800_000;
const QUICK_RUNS = 1;
const FULL_RUNS = 3;
const QUICK_VOTES = 1;
const ARMS = 2;
const DEFAULT_JUDGE_CELL = 'sonnet:low';
const CASE_ROOT = '/tmp/exo-pressure';
const CELL_PATTERN = /^([^:]+):([^:]+)$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const ACTIONS = new Set(['Edit', 'Write']);
const ANSWER_FILE = /^(.+)-([^-]+)-([^-]+)-(\d+)\.md$/;
const CITATION = /([\w./~-]*(?:references\/[\w.-]+\.md|[\w.-]+-prompt\.md))(:\d+)?/g;
const USAGE = `usage: pressure.mjs --cells-for <file> | --prompt <file> --cells <model:effort,...> --plugin-dir <clone> [--main-dir <main clone> | --contrast-env NAME=<a>,<b> | --contrast-style <a>,<b>] [--setting-sources <list>] [--output-style <name>] [--setup <script>] [--full] [--runs <n>] [--out <dir>] [--grade [--criteria <file>] [--threshold <0-1>] [--judge-cell <model:effort>] [--judge-votes <n>]] [--dry-run]
       pressure.mjs --regrade <run folder> --prompt <file> [--full] [--criteria <file>] [--threshold <0-1>] [--judge-cell <model:effort>] [--judge-votes <n>]
Runs one pressure-scenario prompt on every model:effort cell, without and with the skill, --runs times per arm.
The default is the quick tier: one run per arm and one judge vote, a screen rather than a verdict; --full runs ${FULL_RUNS} runs per arm and ${JUDGE_VOTES} judge votes. An explicit --runs or --judge-votes overrides the tier value; grades.json records mode: quick, or full under --full.
--main-dir replaces the without arm with a main arm loading that second copy.
--contrast-env NAME=<a>,<b> loads the plugin in both arms and sets env var NAME to <a> in the with arm and <b> in the contrast arm, so a setting is tested on its own; the arms differ in nothing else. Not together with --main-dir.
--contrast-style <a>,<b> loads the plugin in both arms and sets outputStyle to <a> in the with arm and <b> in the contrast arm; each run's init event must report its arm's style, else WRONG STYLE. Not together with --main-dir, --contrast-env or --output-style.
--grade grades each run against the tagged pass lines of --criteria (default criteria.md beside the prompt), then writes grades.json to --out and prints a pass-rate and delta table per cell.
The verdict per case is PASS, FAIL or INCONCLUSIVE: the 95% Newcombe interval of the with-minus-comparison pass-rate difference against the margin the criteria file states as "margin: <0-1>" (default ${DEFAULT_MARGIN}). PASS when the interval lies wholly above minus the margin, FAIL when wholly below, else INCONCLUSIVE with the runs per arm that would decide it.
--threshold is the pass rate a case with one arm needs (default 1); --judge-cell runs the judge lines (default sonnet:low); --judge-votes is the judge calls per judge line, the majority deciding (default ${QUICK_VOTES}, ${JUDGE_VOTES} under --full); a line whose votes agree under 0.8 prints UNSTABLE JUDGE.
--dry-run spends nothing and prints the session count times the median cost_usd recorded in the grades.json of --out, with the judge calls counted; each graded run records durationMs and cost_usd there.
--regrade <run folder> starts no session: it grades every saved <model>-<effort>-<arm>-<run>.md answer in the folder against the criteria of --prompt, keeps each run's recorded durationMs and cost_usd, rewrites grades.json there and prints the same table. Lines graded by a file or run tag see an empty folder.
--cells-for <file> prints every model:effort cell the file runs on as one --cells value.
--setup <script> runs bash <script> before every single run; the runs then go one after another.
Each answer goes to <model>-<effort>-<arm>-<run>.md in --out; stdout opens with answers: <dir>.
Exits 1 on an unopened citation, a failed setup, a skill loaded from outside its arm's plugin directory or a run whose init-event style differs from its arm.`;

export function readFlags(argv) {
  const flags = parseFlags(argv, { prompt: 'value', cells: 'value', 'plugin-dir': 'value', 'main-dir': 'value', 'contrast-env': 'value', 'contrast-style': 'value', 'setting-sources': 'value', 'output-style': 'value', setup: 'value', runs: 'value', out: 'value', 'cells-for': 'value', grade: 'boolean', criteria: 'value', threshold: 'value', 'judge-cell': 'value', 'judge-votes': 'value', 'dry-run': 'boolean', regrade: 'value', full: 'boolean' }, { usage: USAGE });
  if (flags['cells-for'] !== undefined) return { cellsFor: flags['cells-for'] };
  if (!flags.prompt) throw new UsageError('--prompt needs a file');
  if (flags.regrade !== undefined) return { regrade: path.resolve(flags.regrade), promptFile: flags.prompt, grade: gradeSettings(flags, true), mode: modeOf(flags) };
  if (!flags.cells) throw new UsageError('--cells needs at least one model:effort pair');
  if (!flags['plugin-dir']) throw new UsageError('--plugin-dir needs a clone of the plugin');
  if (flags.runs !== undefined && !POSITIVE_INTEGER.test(flags.runs)) {
    throw new UsageError(`--runs needs a positive integer, got '${flags.runs}'`);
  }
  const grade = gradeSettings(flags, flags.grade === true);
  if (flags['contrast-style'] !== undefined && (flags['contrast-env'] !== undefined || flags['output-style'] !== undefined)) {
    throw new UsageError('--contrast-style sets the style per arm; pass it without --contrast-env or --output-style');
  }
  const contrast = flags['contrast-style'] !== undefined ? parseContrastStyle(flags['contrast-style'])
    : flags['contrast-env'] === undefined ? undefined : parseContrastEnv(flags['contrast-env']);
  if (contrast !== undefined && flags['main-dir'] !== undefined) throw new UsageError('--contrast-env, --contrast-style and --main-dir each define the second arm; pass one');
  const cells = flags.cells.split(',').map((cell) => {
    const match = CELL_PATTERN.exec(cell);
    if (!match) throw new UsageError(`--cells entry '${cell}' needs the shape model:effort, got '${cell}'`);
    return { model: match[1], effort: match[2] };
  });
  const pluginDir = resolvePluginDir('--plugin-dir', flags['plugin-dir'], process.cwd());
  const setupScript = flags.setup === undefined ? undefined : path.resolve(flags.setup);
  if (setupScript !== undefined && !fs.existsSync(setupScript)) {
    throw new UsageError(`--setup needs an existing script, got '${setupScript}'`);
  }
  return {
    promptFile: flags.prompt,
    cells,
    pluginDir,
    pluginId: installedPluginId(pluginDir, '--plugin-dir'),
    mainDir: flags['main-dir'] === undefined ? undefined : resolvePluginDir('--main-dir', flags['main-dir'], process.cwd()),
    contrast,
    settingSources: flags['setting-sources'],
    outputStyle: flags['output-style'],
    setupScript,
    runs: tierValue(flags.runs, flags.full, { quick: QUICK_RUNS, full: FULL_RUNS }),
    mode: modeOf(flags),
    grade: flags.grade === true ? grade : undefined,
    outDir: flags.out,
    dryRun: flags['dry-run'] === true
  };
}

function gradeSettings(flags, criteriaRequired) {
  const threshold = flags.threshold === undefined ? 1 : Number(flags.threshold);
  if (!(threshold >= 0 && threshold <= 1)) throw new UsageError(`--threshold needs a number from 0 to 1, got '${flags.threshold}'`);
  if (flags['judge-votes'] !== undefined && !POSITIVE_INTEGER.test(flags['judge-votes'])) {
    throw new UsageError(`--judge-votes needs a positive integer, got '${flags['judge-votes']}'`);
  }
  const criteriaFile = flags.criteria ?? path.join(path.dirname(flags.prompt), 'criteria.md');
  if (criteriaRequired && !fs.existsSync(criteriaFile)) throw new UsageError(`--grade and --regrade need a criteria file, got '${criteriaFile}'`);
  return { criteriaFile, threshold, judgeCell: flags['judge-cell'] ?? DEFAULT_JUDGE_CELL, votes: tierValue(flags['judge-votes'], flags.full, { quick: QUICK_VOTES, full: JUDGE_VOTES }) };
}

function tierValue(given, full, tier) {
  if (given !== undefined) return Number(given);
  return full === true ? tier.full : tier.quick;
}

function modeOf(flags) {
  return flags.full === true ? 'full' : 'quick';
}

export function parseContrastEnv(value) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=([^,=]+),([^,=]+)$/.exec(value);
  if (!match) throw new UsageError(`--contrast-env needs NAME=<a>,<b>, got '${value}'`);
  if (match[2] === match[3]) throw new UsageError(`--contrast-env needs two different values, got '${match[2]}' twice`);
  return { name: match[1], values: [match[2], match[3]] };
}

export function parseContrastStyle(value) {
  const values = value.split(',');
  if (values.length !== 2 || values.some((style) => style === '')) throw new UsageError(`--contrast-style needs <a>,<b>, got '${value}'`);
  if (values[0] === values[1]) throw new UsageError(`--contrast-style needs two different values, got '${values[0]}' twice`);
  return { style: true, name: 'outputStyle', values };
}

export function contrastArms({ pluginDir, contrast }) {
  const flags = ['--plugin-dir', pluginDir];
  if (contrast.style) {
    return contrast.values.map((outputStyle, at) => ({
      name: at === 0 ? 'with' : 'contrast',
      pluginDir,
      flags: [...flags, '--settings', JSON.stringify({ outputStyle })],
      outputStyle
    }));
  }
  return [
    { name: 'with', pluginDir, flags, env: { [contrast.name]: contrast.values[0] } },
    { name: 'contrast', pluginDir, flags, env: { [contrast.name]: contrast.values[1] } }
  ];
}

function cellsFor(file) {
  const cells = new Set();
  for (const budget of BUDGETS) {
    const table = readKindTable(undefined, { budget });
    const entries = [table.agents[file], ...table.dispatches.filter((dispatch) => dispatch.file === file)];
    for (const entry of entries.filter(Boolean)) {
      const { model, effort } = table.kinds[entry.kind];
      cells.add(`${model}:${effort ?? 'session'}`);
    }
  }
  if (cells.size === 0) throw new UsageError(`no kind in lib/model-kinds.json lists '${file}'`);
  return [...cells].join(',');
}

function unopenedCitations(text, reads) {
  const cited = new Set();
  for (const line of text.split('\n')) {
    const quotes = /["\u201c\u201d]/.test(line) || line.startsWith('>');
    for (const [, citation, lineNumber] of line.matchAll(CITATION)) {
      if (lineNumber !== undefined || quotes) cited.add(citation);
    }
  }
  return [...cited].filter((citation) => {
    const bare = citation.replace(/^\.\//, '');
    return !reads.some((read) => read === bare || read.endsWith(`/${bare}`));
  });
}

function claudeArguments({ model, effort, promptText, settingSources, pluginFlags }) {
  const args = [
    '-p', promptText,
    '--model', model,
    '--effort', effort,
    '--output-format', 'stream-json',
    '--verbose',
    // why: the host's MCP servers would otherwise load and let a user's tools steer a case.
    '--strict-mcp-config'
  ];
  if (settingSources !== undefined) args.push('--setting-sources', settingSources);
  args.push(...pluginFlags);
  return args;
}

export function parseStream(rawStdout) {
  let finalText;
  let firstAction = null;
  const skills = [];
  const skillDirs = [];
  const reads = [];
  let cost;
  let tokens;
  let outputStyle;
  for (const line of rawStdout.split('\n')) {
    if (line.trim() === '') continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'assistant') {
      const toolUses = (event.message?.content ?? []).filter((block) => block.type === 'tool_use');
      for (const toolUse of toolUses) {
        if (firstAction === null && ACTIONS.has(toolUse.name)) {
          firstAction = `${toolUse.name} ${toolUse.input?.file_path ?? ''}`.trim();
        }
        if (toolUse.name === 'Read' && toolUse.input?.file_path) reads.push(String(toolUse.input.file_path));
        if (toolUse.name === 'Skill') skills.push(String(toolUse.input?.skill ?? ''));
      }
    }
    skillDirs.push(...loadedSkillDirs(event));
    if (event.type === 'system' && event.subtype === 'init' && typeof event.output_style === 'string') outputStyle = event.output_style;
    if (event.type === 'result') {
      finalText = typeof event.result === 'string' ? event.result : '';
      if (typeof event.total_cost_usd === 'number') cost = event.total_cost_usd;
      // why: modelUsage is cumulative over turns and holds subagents; usage is the lead's last turn only.
      tokens = event.modelUsage && typeof event.modelUsage === 'object' ? modelUsageTokens(event.modelUsage) : undefined;
    }
  }
  return { cost, tokens, outputStyle, finalText, firstAction, skills, skillDirs, unopened: unopenedCitations(finalText ?? '', reads) };
}

function modelUsageTokens(modelUsage) {
  const tokens = { input: 0, output: 0 };
  for (const usage of Object.values(modelUsage)) {
    const count = (key) => (typeof usage?.[key] === 'number' ? usage[key] : 0);
    tokens.input += count('inputTokens') + count('cacheReadInputTokens') + count('cacheCreationInputTokens');
    tokens.output += count('outputTokens');
  }
  return tokens;
}

// why: The confined run with HOME set to the options-free mirror, so the session
// never reads the user's own exo options from ~/.claude/settings.json.
export function withHome(run, home) {
  return { ...run, env: { ...run.env, HOME: home } };
}

function runArm(run) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...process.env, ...run.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);
    child.on('close', () => {
      clearTimeout(timer);
      resolve({ ...parseStream(stdout), timedOut, stderr, durationMs: Date.now() - started });
    });
  });
}

function caseFolder(setupScript) {
  return path.join(CASE_ROOT, path.basename(path.dirname(setupScript)));
}

function runSetup(setupScript) {
  const setup = spawnSync('bash', [setupScript], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (setup.error) throw setup.error;
  return { exit: setup.status ?? setup.signal, stderr: setup.stderr };
}

function answerText(outcome) {
  const stderr = outcome.stderr.trim() || 'empty';
  if (outcome.setupExit !== undefined) return `(setup failed: exit ${outcome.setupExit})\n\nstderr:\n${stderr}\n`;
  if (outcome.timedOut) return `(timed out after ${TIMEOUT_MS / 1000}s)\n\nstderr:\n${stderr}\n`;
  if (outcome.finalText === undefined) return `(no result)\n\nstderr:\n${stderr}\n`;
  return outcome.finalText;
}

function fileSafe(value) {
  // why: a model id may hold characters such as `[` or `/` that a file name cannot.
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function runInSequence(planned, startRun) {
  const order = planned.map((_, index) => index)
    .sort((left, right) => planned[left].runNumber - planned[right].runNumber || left - right);
  const outcomes = new Array(planned.length);
  for (const index of order) outcomes[index] = await startRun(planned[index]);
  return outcomes;
}

function runGit(cwd, args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${run.stderr.trim()}`);
  return run.stdout.trim();
}

function hostGitSetting(key, placeholder) {
  const run = spawnSync('git', ['config', '--get', key], { encoding: 'utf8' });
  const value = run.status === 0 ? run.stdout.trim() : '';
  return value === '' ? placeholder : value;
}

function initRepository(scratch) {
  // why: the session runs under an options-free HOME, so the commit identity is set in the repository itself.
  const identity = { name: hostGitSetting('user.name', 'pressure'), email: hostGitSetting('user.email', 'pressure@localhost') };
  runGit(scratch, ['init', '--quiet']);
  runGit(scratch, ['config', 'user.name', identity.name]);
  runGit(scratch, ['config', 'user.email', identity.email]);
  runGit(scratch, ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'pressure start']);
}

export function makeRunFolder(armName, setupScript) {
  const runFolder = fs.mkdtempSync(path.join(os.tmpdir(), `pressure-${armName}-`));
  const [scratch, tmp] = ['scratch', 'tmp'].map((name) => path.join(runFolder, name));
  for (const dir of [scratch, tmp]) fs.mkdirSync(dir);
  initRepository(scratch);
  const roots = [scratch, tmp];
  if (setupScript !== undefined) {
    const runCase = caseFolder(setupScript);
    fs.mkdirSync(runCase, { recursive: true });
    roots.push(runCase);
  }
  return { scratch, tmp, roots };
}

export function recordRun(grade, { cost, durationMs }) {
  return { ...grade, durationMs, cost_usd: cost };
}

export function recordedRuns(outDir) {
  const file = path.join(outDir, 'grades.json');
  if (!fs.existsSync(file)) return [];
  return Object.values(JSON.parse(fs.readFileSync(file, 'utf8'))).flatMap((cell) => cell.runs);
}

function medianCost(recorded) {
  const costs = recorded.map((run) => run.cost_usd).filter((cost) => typeof cost === 'number').sort((left, right) => left - right);
  if (costs.length === 0) return null;
  const middle = Math.floor(costs.length / 2);
  return costs.length % 2 ? costs[middle] : (costs[middle - 1] + costs[middle]) / 2;
}

export function dryRunReport({ cells, runs, judgeLines, votes }, recorded) {
  const sessions = cells.length * ARMS * runs;
  const median = medianCost(recorded);
  const spend = median === null ? ', cost unknown' : ` x median $${median.toFixed(4)} = $${(sessions * median).toFixed(2)}`;
  const judgeCalls = sessions * judgeLines * votes;
  return `dry-run: ${sessions} sessions${spend}; judge calls: ${judgeCalls} (at most, a run whose deterministic line fails skips them)`;
}

function gradeSavedAnswers(runFolder, { promptFile, grade, judge }, emptyDir) {
  const lines = linesForCase(parseCriteria(fs.readFileSync(grade.criteriaFile, 'utf8')), path.basename(promptFile));
  const summaryFile = path.join(runFolder, 'grades.json');
  const prior = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')) : {};
  const gradesByCell = {};
  for (const name of fs.readdirSync(runFolder).sort()) {
    const match = ANSWER_FILE.exec(name);
    if (!match) continue;
    const [, model, effort, arm, run] = match;
    const safeCell = `${model}:${effort}`;
    const cell = Object.keys(prior).find((key) => key.split(':').map(fileSafe).join(':') === safeCell) ?? safeCell;
    const answer = fs.readFileSync(path.join(runFolder, name), 'utf8');
    const graded = gradeRun({ case: path.basename(promptFile), arm, run: Number(run), lines, answer, dir: emptyDir, judge, votes: grade.votes });
    const before = (prior[cell]?.runs ?? []).find((saved) => saved.arm === arm && saved.run === Number(run));
    (gradesByCell[cell] ??= []).push({ ...graded, durationMs: before?.durationMs, cost_usd: before?.cost_usd });
  }
  return gradesByCell;
}

export function regradeFolder(runFolder, options) {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-regrade-'));
  try {
    return gradeSavedAnswers(runFolder, options, emptyDir);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
}

export function gradeSummary(gradesByCell, options = {}) {
  const { mode, ...aggregateOptions } = options;
  return Object.fromEntries(Object.entries(gradesByCell).map(([cell, runs]) => [cell, { mode, runs, cases: aggregate(runs, aggregateOptions) }]));
}

export function writeGrades(outDir, gradesByCell, options = {}) {
  const summary = gradeSummary(gradesByCell, options);
  fs.writeFileSync(path.join(outDir, 'grades.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return deltaTable(summary);
}

export function deltaTable(summary) {
  const percent = (rate) => (rate === undefined ? 'n/a' : `${Math.round(rate * 100)}%`);
  const signed = (value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
  const lines = Object.entries(summary).flatMap(([cell, { cases }]) => cases.map((result) => {
    const delta = result.delta === null ? 'n/a' : signed(result.delta);
    const compared = result.comparison ?? 'none';
    const interval = result.ci === null ? '' : ` ci [${signed(result.ci[0])}, ${signed(result.ci[1])}] margin ${Math.round(result.margin * 100)}%`;
    const needs = result.verdict !== 'INCONCLUSIVE' ? '' : (result.needed === null ? ' (more than 1000 runs per arm to decide)' : ` (${result.needed} runs per arm would decide at these rates)`);
    return `${cell} ${result.case}: with ${percent(result.rates.with)} ${compared} ${percent(result.rates[compared])} delta ${delta}${interval} ${result.verdict}${needs}${result.noSkillEffect ? ' no skill effect' : ''}`;
  }));
  const unstable = Object.entries(summary).flatMap(([cell, { runs }]) => runs.flatMap((grade) => grade.lines
    .filter((line) => line.unstable)
    .map((line) => `UNSTABLE JUDGE ${cell} ${grade.case} ${grade.arm} run ${grade.run}: votes ${line.votes.map((vote) => (vote ? 'PASS' : 'FAIL')).join('/')} on '${line.text}'`)));
  return [...lines, ...unstable];
}

async function runCell({ model, effort }, promptText, { pluginDir, pluginId, mainDir, contrast, settingSources, outputStyle, setupScript, runs, outDir, home, grade, promptFile }) {
  const gradeLines = grade && linesForCase(parseCriteria(fs.readFileSync(grade.criteriaFile, 'utf8')), path.basename(promptFile));
  const judge = grade && defaultJudge(grade.judgeCell);
  const arms = contrast === undefined
    ? [comparisonArm({ pluginId, mainDir }), { name: 'with', pluginDir, flags: ['--plugin-dir', pluginDir] }]
    : contrastArms({ pluginDir, contrast });
  const planned = arms.flatMap((arm) => Array.from({ length: runs }, (_, index) => ({ arm, runNumber: index + 1 })));
  const startRun = ({ arm, runNumber }) => {
    if (setupScript !== undefined) {
      const setup = runSetup(setupScript);
      if (setup.exit !== 0) return { setupExit: setup.exit, stderr: setup.stderr };
    }
    const { scratch, tmp, roots } = makeRunFolder(arm.name, setupScript);
    const settingsAt = arm.flags.indexOf('--settings');
    const armSettings = settingsAt === -1 ? undefined : JSON.parse(arm.flags[settingsAt + 1]);
    const settings = outputStyle === undefined ? armSettings : { ...armSettings, outputStyle };
    const pluginFlags = settingsAt === -1 ? arm.flags : arm.flags.filter((_, at) => at !== settingsAt && at !== settingsAt + 1);
    const args = claudeArguments({ model, effort, promptText, settingSources, pluginFlags });
    const confined = withHome(confinedClaude({ args, roots, cwd: scratch, tmp, settings }), home);
    const ran = runArm({ ...confined, env: { ...confined.env, ...arm.env } });
    if (!grade) return ran;
    // why: the next setup run rebuilds the case folder, so a run is graded before the next one starts.
    return ran.then((outcome) => ({
      ...outcome,
      grade: gradeRun({ case: path.basename(promptFile), arm: arm.name, run: runNumber, lines: gradeLines, answer: outcome.finalText ?? '', dir: setupScript === undefined ? scratch : roots[2], judge, votes: grade.votes })
    }));
  };
  const outcomes = setupScript === undefined
    ? await Promise.all(planned.map(startRun))
    : await runInSequence(planned, startRun);
  console.log(`${model}:${effort}${contrast === undefined ? '' : ` ${contrast.name}: with=${contrast.values[0]} contrast=${contrast.values[1]}`}`);
  let failed = false;
  const grades = [];
  const totals = new Map();
  planned.forEach(({ arm, runNumber }, index) => {
    const outcome = outcomes[index];
    const file = path.join(outDir, `${fileSafe(model)}-${fileSafe(effort)}-${arm.name}-${runNumber}.md`);
    fs.writeFileSync(file, answerText(outcome));
    if (outcome.setupExit !== undefined) {
      failed = true;
      console.log(`  ${arm.name} ${runNumber}: ${file} [setup failed: exit ${outcome.setupExit}]`);
      return;
    }
    if (outcome.grade) grades.push(recordRun(outcome.grade, outcome));
    const skills = outcome.skills.length > 0 ? outcome.skills.join(', ') : 'none';
    const cost = typeof outcome.cost === 'number' ? ` [cost: $${outcome.cost.toFixed(4)}]` : '';
    const tokens = outcome.tokens ? ` [tokens: in=${outcome.tokens.input} out=${outcome.tokens.output}]` : '';
    const total = totals.get(arm.name) ?? {};
    if (cost !== '') total.cost = (total.cost ?? 0) + outcome.cost;
    if (tokens !== '') total.tokens = { input: (total.tokens?.input ?? 0) + outcome.tokens.input, output: (total.tokens?.output ?? 0) + outcome.tokens.output };
    if (cost !== '' || tokens !== '') totals.set(arm.name, total);
    const unopened = outcome.unopened.map((citation) => ` [unopened citation: ${citation}]`).join('');
    console.log(`  ${arm.name} ${runNumber}: ${file} [first edit/write: ${outcome.firstAction ?? 'none'}] [skills: ${skills}]${cost}${tokens}${unopened}`);
    if (unopened !== '') failed = true;
    if (arm.outputStyle !== undefined && outcome.outputStyle !== arm.outputStyle) {
      failed = true;
      console.log(`  WRONG STYLE ${arm.name} ${runNumber}: init event reports '${outcome.outputStyle ?? 'none'}', arm expects '${arm.outputStyle}'`);
    }
    for (const dir of wrongCopies(outcome.skillDirs, arm.pluginDir)) {
      failed = true;
      console.log(`  WRONG COPY ${arm.name} ${runNumber}: ${dir} is not under ${arm.pluginDir}`);
    }
  });
  for (const [name, { cost, tokens }] of totals) {
    const parts = [cost === undefined ? '' : `$${cost.toFixed(4)}`, tokens ? `[tokens: in=${tokens.input} out=${tokens.output}]` : ''];
    console.log(`  total ${name}: ${parts.filter(Boolean).join(' ')}`);
  }
  return { failed, grades };
}

async function runOneCell(cell, promptText, options) {
  const { gradesByCell, ...cellOptions } = options;
  const { failed, grades } = await runCell(cell, promptText, cellOptions);
  if (failed) process.exitCode = 1;
  gradesByCell[`${cell.model}:${cell.effort}`] = grades;
}

async function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${USAGE}: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (flags.cellsFor !== undefined) {
    try {
      console.log(cellsFor(flags.cellsFor));
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      console.error(`${USAGE}: ${error.message}`);
      process.exitCode = 2;
    }
    return;
  }
  if (flags.regrade !== undefined) {
    const gradesByCell = regradeFolder(flags.regrade, { promptFile: flags.promptFile, grade: flags.grade, judge: defaultJudge(flags.grade.judgeCell) });
    const margins = parseMargins(fs.readFileSync(flags.grade.criteriaFile, 'utf8'));
    console.log(writeGrades(flags.regrade, gradesByCell, { threshold: flags.grade.threshold, margins, mode: flags.mode }).join('\n'));
    return;
  }
  if (flags.dryRun) {
    const judgeLines = flags.grade ? linesForCase(parseCriteria(fs.readFileSync(flags.grade.criteriaFile, 'utf8')), path.basename(flags.promptFile)).filter((line) => line.tag.kind === 'judge').length : 0;
    const recorded = flags.outDir === undefined ? [] : recordedRuns(path.resolve(flags.outDir));
    console.log(dryRunReport({ cells: flags.cells, runs: flags.runs, judgeLines, votes: flags.grade?.votes ?? 0 }, recorded));
    return;
  }
  const refusal = confineRefusal();
  if (refusal !== undefined) {
    console.error(`pressure.mjs: ${refusal}`);
    process.exitCode = 2;
    return;
  }
  let promptText;
  try {
    promptText = fs.readFileSync(flags.promptFile, 'utf8');
  } catch (error) {
    console.error(`usage: pressure.mjs: cannot read --prompt file '${flags.promptFile}': ${error.message}`);
    process.exitCode = 2;
    return;
  }
  let outDir;
  try {
    outDir = flags.outDir === undefined
      ? fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-answers-'))
      : path.resolve(flags.outDir);
    fs.mkdirSync(outDir, { recursive: true });
  } catch (error) {
    console.error(`usage: pressure.mjs: cannot create --out directory '${flags.outDir}': ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (process.env.CLAUDE_CONFIG_DIR) {
    console.error('usage: pressure.mjs: CLAUDE_CONFIG_DIR is set, but the default-options mirror covers only ~/.claude; unset it');
    process.exitCode = 2;
    return;
  }
  console.log(`answers: ${outDir}`);
  const home = makeDefaultOptionsHome();
  const gradesByCell = {};
  try {
    for (const cell of flags.cells) {
      await runOneCell(cell, promptText, { ...flags, outDir, home, gradesByCell });
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
  if (flags.grade) {
    const margins = parseMargins(fs.readFileSync(flags.grade.criteriaFile, 'utf8'));
    console.log(writeGrades(outDir, gradesByCell, { threshold: flags.grade.threshold, margins, mode: flags.mode }).join('\n'));
  }
}

if (isMain(import.meta.url)) {
  await main();
}
