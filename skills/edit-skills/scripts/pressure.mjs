#!/usr/bin/env node
// Runs one pressure-scenario prompt on every model:effort cell, both without
// the skill and with it, --runs times per arm (default 1), so edit-skills's
// step 2 and step 4 stop reading N manual `claude -p` transcripts by hand.
// The with arm loads the clone through --plugin-dir; the without arm gets no
// --plugin-dir and disables the installed copy of the clone's plugin
// (`<plugin>@<marketplace>`, read from the clone's manifests) through
// --settings, since an installed and enabled plugin otherwise loads anyway.
// --main-dir replaces the without arm with a `main` arm that loads that
// second copy through --plugin-dir. Both directories resolve against the
// caller's cwd, since `claude` runs in a scratch directory and falls back
// silently to the installed copy when --plugin-dir holds no plugin.
// --setting-sources passes through to every run of both arms, so a case can
// leave out the user's settings and memory, which could decide it for reasons
// outside the plugin.
// --output-style <name> sets `outputStyle` in the settings of every run of
// both arms, so a style case compares replies under that style.
// A run whose answer names a `references/*.md` or `*-prompt.md` path that no
// `Read` call of that run opened gets `[unopened citation: <path>]` on its arm
// line and ends the runner with exit 1, since the citation is faked. Only a
// path with a `:<line>` suffix, or on a line that quotes text between double
// quotes or after a leading `>`, counts as a citation; a bare mention does not.
// `--cells-for <file>` prints, and runs nothing else, every `model:effort`
// cell the file runs on as one `--cells` value: its kind's cell, a cell for
// each budget replacement of the kind's tier, and the cell of every
// `dispatches` entry for the file, all from `lib/model-kinds.json`, plus the
// cell of each Codex twin built from the file, since a budget dispatches the
// file with that twin's kind as the call's model and effort; a kind with
// no effort prints `session`.
// Every run of both arms of a cell runs in parallel, each in its own scratch
// directory outside the repository, matching pressure-scenarios.md, and
// confined by #confine-claude so it can write only in that run folder's
// scratch/ and tmp/ and, under ~/.claude, only the transcript folder of its
// scratch/; on Windows the runner refuses; cells
// run one after another. --setup <script> (resolved against the caller's cwd)
// runs `bash <script>` right before every single run instead, and the runs go
// one after another, alternating arms (comparison 1, with 1, comparison 2,
// ...), so each run starts from a fixture the script just rebuilt and no other
// run touches. Such a run can also write in its case folder,
// /tmp/exo-pressure/<the name of the script's folder>, since the case prompts
// name their fixture files there; without --setup the runs share the fixture
// in parallel, so it stays read-only. A setup that exits non-zero skips its run: the answer file
// holds a note with the setup's stderr, the arm line reads
// `[setup failed: exit <code>]` and the runner ends with exit 1.
//
// Each run's full final answer, untruncated, goes to its own file
// `<model>-<effort>-<arm>-<run>.md` in the --out directory (default a fresh
// temporary directory outside any repository); a timeout or a run with no
// result gets a note holding the full stderr instead. stdout opens with
// `answers: <dir>`, then per cell its label and one line per arm and run:
//
//   without 1: <file> [first edit/write: Edit /x.js] [skills: exo:find-cause] [cost: $0.1234]
//
// `[cost: $<total_cost_usd>]` comes from the run's result event and is left
// off a run whose result carries none. Each cell ends on one line per arm,
// `  total <arm>: $<sum>`, summing the costs its runs report; an arm with no
// reported cost prints no total.
//
// A skill loaded from outside its arm's plugin directory adds a line
// `  WRONG COPY <arm> <run>: <skill dir> is not under <plugin dir>` and
// ends the runner with exit 1, so that run never counts as a pass.
//
//   node pressure.mjs --cells-for <file>
//   node pressure.mjs --prompt <file> --cells opus:high,sonnet:high --plugin-dir <clone> [--main-dir <main clone>] [--setting-sources project,local] [--output-style <name>] [--setup <script>] [--runs 3] [--out <dir>]

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { confineRefusal, confinedClaude } from '#confine-claude';
import { readKindTable } from '#model-kinds';
import { comparisonArm, installedPluginId, loadedSkillDirs, resolvePluginDir, wrongCopies } from '#plugin-copy';
import { UsageError, parseFlags, isMain } from '#script-flags';

const TIMEOUT_MS = 1_800_000;
const DEFAULT_RUNS = 1;
const CASE_ROOT = '/tmp/exo-pressure';
const CELL_PATTERN = /^([^:]+):([^:]+)$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const ACTIONS = new Set(['Edit', 'Write']);
const CITATION = /([\w./~-]*(?:references\/[\w.-]+\.md|[\w.-]+-prompt\.md))(:\d+)?/g;
const USAGE ='usage: pressure.mjs --cells-for <file> | --prompt <file> --cells <model:effort,...> --plugin-dir <clone> [--main-dir <main clone>] [--setting-sources <list>] [--output-style <name>] [--setup <script>] [--runs <n>] [--out <dir>]';

function readFlags(argv) {
  const flags = parseFlags(argv, { prompt: 'value', cells: 'value', 'plugin-dir': 'value', 'main-dir': 'value', 'setting-sources': 'value', 'output-style': 'value', setup: 'value', runs: 'value', out: 'value', 'cells-for': 'value' });
  if (flags['cells-for'] !== undefined) return { cellsFor: flags['cells-for'] };
  if (!flags.prompt) throw new UsageError('--prompt needs a file');
  if (!flags.cells) throw new UsageError('--cells needs at least one model:effort pair');
  if (!flags['plugin-dir']) throw new UsageError('--plugin-dir needs a clone of the plugin');
  if (flags.runs !== undefined && !POSITIVE_INTEGER.test(flags.runs)) {
    throw new UsageError(`--runs needs a positive integer, got '${flags.runs}'`);
  }
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
    settingSources: flags['setting-sources'],
    outputStyle: flags['output-style'],
    setupScript,
    runs: flags.runs === undefined ? DEFAULT_RUNS : Number(flags.runs),
    outDir: flags.out
  };
}

// The `--cells` value for one file of the kind table.
function cellsFor(file) {
  const table = readKindTable();
  const tiers = table.providers[table.provider].tiers;
  const entries = [table.agents[file], table.skills[file], ...table.dispatches.filter((dispatch) => dispatch.file === file)];
  const cells = new Set();
  for (const entry of entries.filter(Boolean)) {
    const { model, effort } = table.kinds[entry.kind];
    const label = effort ?? 'session';
    cells.add(`${model}:${label}`);
    const tier = Object.keys(tiers).find((name) => tiers[name] === model);
    for (const swaps of Object.values(table.budgets ?? {})) {
      if (swaps[tier]) cells.add(`${tiers[swaps[tier]]}:${label}`);
    }
  }
  const twins = Object.values(table.providers).flatMap((block) => Object.values(block.codexTwins ?? {}));
  for (const twin of twins.filter((entry) => entry.from === file)) {
    const { model, effort } = table.kinds[twin.kind];
    const tier = Object.keys(tiers).find((name) => tiers[name] === model);
    cells.add(`${twin.budget === undefined ? model : tiers[table.budgets[twin.budget][tier]]}:${effort ?? 'session'}`);
  }
  if (cells.size === 0) throw new UsageError(`no kind in lib/model-kinds.json lists '${file}'`);
  return [...cells].join(',');
}

// The cited paths of `text` that no path in `reads` ends with. A path counts
// as cited with a `:<line>` suffix or on a line that quotes text.
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

// The base arguments of one run; #confine-claude adds the permission mode.
function claudeArguments({ model, effort, promptText, settingSources, pluginFlags }) {
  const args = [
    '-p', promptText,
    '--model', model,
    '--effort', effort,
    '--output-format', 'stream-json',
    '--verbose',
    // Pressure runs exclude the host's MCP servers so a user's tools cannot steer a case.
    '--strict-mcp-config'
  ];
  if (settingSources !== undefined) args.push('--setting-sources', settingSources);
  args.push(...pluginFlags);
  return args;
}

// The result of one run: the final assistant text (undefined when the run
// never produced one, such as a timeout or a refusal), the first Edit or
// Write tool call across the whole stream, the `skill` input of every Skill
// tool call, in order, the base directory of every skill loaded, and the
// paths the answer cites without a Read of them, and the cost the result
// event reports.
function parseStream(rawStdout) {
  let finalText;
  let firstAction = null;
  const skills = [];
  const skillDirs = [];
  const reads = [];
  let cost;
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
    if (event.type === 'result') {
      finalText = typeof event.result === 'string' ? event.result : '';
      if (typeof event.total_cost_usd === 'number') cost = event.total_cost_usd;
    }
  }
  return { cost, finalText, firstAction, skills, skillDirs, unopened: unopenedCitations(finalText ?? '', reads) };
}

// Runs one confined claude: `run` comes from confinedClaude.
function runArm(run) {
  return new Promise((resolve) => {
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
      resolve({ ...parseStream(stdout), timedOut, stderr });
    });
  });
}

// The case folder a setup script rebuilds: `/tmp/exo-pressure/<the name of
// the script's folder>`, the layout benchmarks/pressure/README.md fixes, since
// every case prompt names its files by that absolute path.
function caseFolder(setupScript) {
  return path.join(CASE_ROOT, path.basename(path.dirname(setupScript)));
}

// Rebuilds the fixture for the next run; its stdout is dropped so it never
// mixes into the runner's own lines.
function runSetup(setupScript) {
  const setup = spawnSync('bash', [setupScript], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (setup.error) throw setup.error;
  return { exit: setup.status ?? setup.signal, stderr: setup.stderr };
}

// The answer file's content: the full final answer, or a note holding the
// full stderr when the setup failed, the run timed out or produced no result.
function answerText(outcome) {
  const stderr = outcome.stderr.trim() || 'empty';
  if (outcome.setupExit !== undefined) return `(setup failed: exit ${outcome.setupExit})\n\nstderr:\n${stderr}\n`;
  if (outcome.timedOut) return `(timed out after ${TIMEOUT_MS / 1000}s)\n\nstderr:\n${stderr}\n`;
  if (outcome.finalText === undefined) return `(no result)\n\nstderr:\n${stderr}\n`;
  return outcome.finalText;
}

// A file-name-safe form of one cell value, since a model id may hold
// characters such as `[` or `/`.
function fileSafe(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

// Runs the planned runs one after another, alternating arms, and returns
// their outcomes in planned order.
async function runInSequence(planned, startRun) {
  const order = planned.map((_, index) => index)
    .sort((left, right) => planned[left].runNumber - planned[right].runNumber || left - right);
  const outcomes = new Array(planned.length);
  for (const index of order) outcomes[index] = await startRun(planned[index]);
  return outcomes;
}

// Runs one cell and prints its lines; true when some setup failed or some
// run loaded a wrong copy.
async function runCell({ model, effort }, promptText, { pluginDir, pluginId, mainDir, settingSources, outputStyle, setupScript, runs, outDir }) {
  const arms = [
    comparisonArm({ pluginId, mainDir }),
    { name: 'with', pluginDir, flags: ['--plugin-dir', pluginDir] }
  ];
  const planned = arms.flatMap((arm) => Array.from({ length: runs }, (_, index) => ({ arm, runNumber: index + 1 })));
  const startRun = ({ arm }) => {
    if (setupScript !== undefined) {
      const setup = runSetup(setupScript);
      if (setup.exit !== 0) return { setupExit: setup.exit, stderr: setup.stderr };
    }
    // The run folder holds scratch/, the cwd, and tmp/, its temporary directory;
    // the run can write nowhere else, save the case folder of a --setup run.
    const runFolder = fs.mkdtempSync(path.join(os.tmpdir(), `pressure-${arm.name}-`));
    const [scratch, tmp] = ['scratch', 'tmp'].map((name) => path.join(runFolder, name));
    for (const dir of [scratch, tmp]) fs.mkdirSync(dir);
    const roots = [scratch, tmp];
    if (setupScript !== undefined) {
      // The sandbox resolves every root, and a setup need not create the case
      // folder, so it must exist before the sandbox is built.
      const runCase = caseFolder(setupScript);
      fs.mkdirSync(runCase, { recursive: true });
      roots.push(runCase);
    }
    const settingsAt = arm.flags.indexOf('--settings');
    const armSettings = settingsAt === -1 ? undefined : JSON.parse(arm.flags[settingsAt + 1]);
    const settings = outputStyle === undefined ? armSettings : { ...armSettings, outputStyle };
    const pluginFlags = settingsAt === -1 ? arm.flags : arm.flags.filter((_, at) => at !== settingsAt && at !== settingsAt + 1);
    const args = claudeArguments({ model, effort, promptText, settingSources, pluginFlags });
    return runArm(confinedClaude({ args, roots, cwd: scratch, tmp, settings }));
  };
  const outcomes = setupScript === undefined
    ? await Promise.all(planned.map(startRun))
    : await runInSequence(planned, startRun);
  console.log(`${model}:${effort}`);
  let failed = false;
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
    const skills = outcome.skills.length > 0 ? outcome.skills.join(', ') : 'none';
    const cost = typeof outcome.cost === 'number' ? ` [cost: $${outcome.cost.toFixed(4)}]` : '';
    if (cost !== '') totals.set(arm.name, (totals.get(arm.name) ?? 0) + outcome.cost);
    const unopened = outcome.unopened.map((citation) => ` [unopened citation: ${citation}]`).join('');
    console.log(`  ${arm.name} ${runNumber}: ${file} [first edit/write: ${outcome.firstAction ?? 'none'}] [skills: ${skills}]${cost}${unopened}`);
    if (unopened !== '') failed = true;
    for (const dir of wrongCopies(outcome.skillDirs, arm.pluginDir)) {
      failed = true;
      console.log(`  WRONG COPY ${arm.name} ${runNumber}: ${dir} is not under ${arm.pluginDir}`);
    }
  });
  for (const [name, total] of totals) console.log(`  total ${name}: $${total.toFixed(4)}`);
  return failed;
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
  console.log(`answers: ${outDir}`);
  for (const cell of flags.cells) {
    if (await runCell(cell, promptText, { ...flags, outDir })) process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) {
  await main();
}
