import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { installedPluginId, resolvePluginDir } from '#plugin-copy';
import { UsageError } from '#script-flags';
import { DEFAULT_MARGIN, JUDGE_VOTES } from './pressure-grade.mjs';
import { parseContrastEnv, parseContrastStyle } from './pressure-contrast.mjs';

const QUICK_RUNS = 1;
const FULL_RUNS = 3;
const QUICK_VOTES = 1;
const DEFAULT_JUDGE_CELL = 'sonnet:low';
const CELL_PATTERN = /^([^:]+):([^:]+)$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

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
