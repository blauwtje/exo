#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { confineRefusal } from '#confine-claude';
import { BUDGETS, readKindTable } from '#model-kinds';
import { installedPluginId, resolvePluginDir } from '#plugin-copy';
import { POSITIVE_INTEGER, USAGE_EXIT, UsageError, isMain, parseFlags } from '#script-flags';
import { calibrationLines } from './judge-calibration.mjs';
import { ANSWER_FILE, fileSafe } from './pressure-answers.mjs';
import { runOneCell } from './pressure-cell.mjs';
import { parseContrastEnv, parseContrastStyle } from './pressure-contrast.mjs';
import { DEFAULT_MARGIN, JUDGE_VOTES, aggregate, defaultJudge, gradeRun, linesForCase, parseCriteria, parseMargins } from './pressure-grade.mjs';
import { pressureHome } from './pressure-home.mjs';
import { dryRunReport, recordedRuns } from './pressure-records.mjs';

const QUICK_RUNS = 1;
const FULL_RUNS = 3;
const QUICK_VOTES = 1;
const DEFAULT_JUDGE_CELL = 'sonnet:low';
const CELL_PATTERN = /^([^:]+):([^:]+)$/;

export const USAGE = `usage: pressure.mjs --cells-for <file> | --prompt <file> --cells <model:effort,...> --plugin-dir <clone> [--main-dir <main clone> | --contrast-env NAME=<a>,<b> | --contrast-style <a>,<b>] [--setting-sources <list>] [--output-style <name>] [--setup <script>] [--full] [--runs <n>] [--out <dir>] [--grade [--criteria <file>] [--threshold <0-1>] [--judge-cell <model:effort>] [--judge-votes <n>]] [--dry-run]
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

export const SPEC = { prompt: 'value', cells: 'value', 'plugin-dir': 'value', 'main-dir': 'value', 'contrast-env': 'value', 'contrast-style': 'value', 'setting-sources': 'value', 'output-style': 'value', setup: 'value', runs: 'value', out: 'value', 'cells-for': 'value', grade: 'boolean', criteria: 'value', threshold: 'value', 'judge-cell': 'value', 'judge-votes': 'value', 'dry-run': 'boolean', regrade: 'value', full: 'boolean' };

function contrastFrom(flags) {
  if (flags['contrast-style'] !== undefined && (flags['contrast-env'] !== undefined || flags['output-style'] !== undefined)) {
    throw new UsageError('--contrast-style sets the style per arm; pass it without --contrast-env or --output-style');
  }
  const contrast = flags['contrast-style'] !== undefined ? parseContrastStyle(flags['contrast-style'])
    : flags['contrast-env'] === undefined ? undefined : parseContrastEnv(flags['contrast-env']);
  if (contrast !== undefined && flags['main-dir'] !== undefined) throw new UsageError('--contrast-env, --contrast-style and --main-dir each define the second arm; pass one');
  return contrast;
}

function parseCells(text) {
  return text.split(',').map((cell) => {
    const match = CELL_PATTERN.exec(cell);
    if (!match) throw new UsageError(`--cells entry '${cell}' needs the shape model:effort, got '${cell}'`);
    return { model: match[1], effort: match[2] };
  });
}

function setupScriptFrom(setup) {
  if (setup === undefined) return undefined;
  const setupScript = path.resolve(setup);
  if (!fs.existsSync(setupScript)) throw new UsageError(`--setup needs an existing script, got '${setupScript}'`);
  return setupScript;
}

export function optionsFrom(flags) {
  if (flags['cells-for'] !== undefined) return { cellsFor: flags['cells-for'] };
  if (!flags.prompt) throw new UsageError('--prompt needs a file');
  if (flags.regrade !== undefined) return { regrade: path.resolve(flags.regrade), promptFile: flags.prompt, grade: gradeSettings(flags, true), mode: modeOf(flags) };
  if (!flags.cells) throw new UsageError('--cells needs at least one model:effort pair');
  if (!flags['plugin-dir']) throw new UsageError('--plugin-dir needs a clone of the plugin');
  if (flags.runs !== undefined && !POSITIVE_INTEGER.test(flags.runs)) {
    throw new UsageError(`--runs needs a positive integer, got '${flags.runs}'`);
  }
  const grade = gradeSettings(flags, flags.grade === true);
  const contrast = contrastFrom(flags);
  const cells = parseCells(flags.cells);
  const pluginDir = resolvePluginDir('--plugin-dir', flags['plugin-dir'], process.cwd());
  const setupScript = setupScriptFrom(flags.setup);
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


export function cellsFor(file) {
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

function gradeSummary(gradesByCell, options) {
  const { mode, ...aggregateOptions } = options;
  return Object.fromEntries(Object.entries(gradesByCell).map(([cell, runs]) => [cell, { mode, runs, cases: aggregate(runs, aggregateOptions) }]));
}

function writeGrades(outDir, gradesByCell, options) {
  const summary = gradeSummary(gradesByCell, options);
  fs.writeFileSync(path.join(outDir, 'grades.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return deltaTable(summary);
}

export function gradeReport(outDir, gradesByCell, options) {
  return [...writeGrades(outDir, gradesByCell, options), ...calibrationLines(['pressure-line'])];
}

function deltaTable(summary) {
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

function usageError(message) {
  console.error(message);
  process.exitCode = USAGE_EXIT;
}

function parseOptions() {
  try {
    return optionsFrom(parseFlags(process.argv.slice(2), SPEC, { usage: USAGE }));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    usageError(`${USAGE}: ${error.message}`);
    return undefined;
  }
}

function printCells(spec) {
  try {
    console.log(cellsFor(spec));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    usageError(`${USAGE}: ${error.message}`);
  }
}

function printGrades(folder, gradesByCell, flags) {
  const margins = parseMargins(fs.readFileSync(flags.grade.criteriaFile, 'utf8'));
  console.log(gradeReport(folder, gradesByCell, { threshold: flags.grade.threshold, margins, mode: flags.mode }).join('\n'));
}

function regrade(flags) {
  const gradesByCell = regradeFolder(flags.regrade, { promptFile: flags.promptFile, grade: flags.grade, judge: defaultJudge(flags.grade.judgeCell) });
  printGrades(flags.regrade, gradesByCell, flags);
}

function dryRun(flags) {
  const judgeLines = flags.grade ? linesForCase(parseCriteria(fs.readFileSync(flags.grade.criteriaFile, 'utf8')), path.basename(flags.promptFile)).filter((line) => line.tag.kind === 'judge').length : 0;
  const recorded = flags.outDir === undefined ? [] : recordedRuns(path.resolve(flags.outDir));
  console.log(dryRunReport({ cells: flags.cells, runs: flags.runs, judgeLines, votes: flags.grade?.votes ?? 0 }, recorded));
}

function readPrompt(promptFile) {
  try {
    return fs.readFileSync(promptFile, 'utf8');
  } catch (error) {
    usageError(`usage: pressure.mjs: cannot read --prompt file '${promptFile}': ${error.message}`);
    return undefined;
  }
}

function makeOutDir(requested) {
  try {
    const outDir = requested === undefined
      ? fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-answers-'))
      : path.resolve(requested);
    fs.mkdirSync(outDir, { recursive: true });
    return outDir;
  } catch (error) {
    usageError(`usage: pressure.mjs: cannot create --out directory '${requested}': ${error.message}`);
    return undefined;
  }
}

async function runCells(flags, promptText, outDir) {
  console.log(`answers: ${outDir}`);
  const home = pressureHome();
  const gradesByCell = {};
  try {
    for (const cell of flags.cells) {
      await runOneCell(cell, promptText, { ...flags, outDir, home, gradesByCell });
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
  if (flags.grade) printGrades(outDir, gradesByCell, flags);
}

async function main() {
  const flags = parseOptions();
  if (flags === undefined) return;
  if (flags.cellsFor !== undefined) return printCells(flags.cellsFor);
  if (flags.regrade !== undefined) return regrade(flags);
  if (flags.dryRun) return dryRun(flags);
  const refusal = confineRefusal();
  if (refusal !== undefined) return usageError(`pressure.mjs: ${refusal}`);
  const promptText = readPrompt(flags.promptFile);
  if (promptText === undefined) return;
  const outDir = makeOutDir(flags.outDir);
  if (outDir === undefined) return;
  if (process.env.CLAUDE_CONFIG_DIR) return usageError('usage: pressure.mjs: CLAUDE_CONFIG_DIR is set, but the default-options mirror covers only ~/.claude; unset it');
  await runCells(flags, promptText, outDir);
}

if (isMain(import.meta.url)) {
  await main();
}
