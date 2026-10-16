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

const TIMEOUT_MS = 1_800_000;
const DEFAULT_RUNS = 1;
const CASE_ROOT = '/tmp/exo-pressure';
const CELL_PATTERN = /^([^:]+):([^:]+)$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const ACTIONS = new Set(['Edit', 'Write']);
const CITATION = /([\w./~-]*(?:references\/[\w.-]+\.md|[\w.-]+-prompt\.md))(:\d+)?/g;
const USAGE = `usage: pressure.mjs --cells-for <file> | --prompt <file> --cells <model:effort,...> --plugin-dir <clone> [--main-dir <main clone>] [--setting-sources <list>] [--output-style <name>] [--setup <script>] [--runs <n>] [--out <dir>]
Runs one pressure-scenario prompt on every model:effort cell, without and with the skill, --runs times per arm.
--main-dir replaces the without arm with a main arm loading that second copy.
--cells-for <file> prints every model:effort cell the file runs on as one --cells value.
--setup <script> runs bash <script> before every single run; the runs then go one after another.
Each answer goes to <model>-<effort>-<arm>-<run>.md in --out; stdout opens with answers: <dir>.
Exits 1 on an unopened citation, a failed setup or a skill loaded from outside its arm's plugin directory.`;

function readFlags(argv) {
  const flags = parseFlags(argv, { prompt: 'value', cells: 'value', 'plugin-dir': 'value', 'main-dir': 'value', 'setting-sources': 'value', 'output-style': 'value', setup: 'value', runs: 'value', out: 'value', 'cells-for': 'value' }, { usage: USAGE });
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

function parseStream(rawStdout) {
  let finalText;
  let firstAction = null;
  const skills = [];
  const skillDirs = [];
  const reads = [];
  let cost;
  let tokens;
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
      if (event.usage && typeof event.usage === 'object') tokens = usageTokens(event.usage);
    }
  }
  return { cost, tokens, finalText, firstAction, skills, skillDirs, unopened: unopenedCitations(finalText ?? '', reads) };
}

function usageTokens(usage) {
  const count = (key) => (typeof usage[key] === 'number' ? usage[key] : 0);
  return {
    input: count('input_tokens') + count('cache_creation_input_tokens') + count('cache_read_input_tokens'),
    output: count('output_tokens')
  };
}

// why: The confined run with HOME set to the options-free mirror, so the session
// never reads the user's own exo options from ~/.claude/settings.json.
export function withHome(run, home) {
  return { ...run, env: { ...run.env, HOME: home } };
}

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

async function runCell({ model, effort }, promptText, { pluginDir, pluginId, mainDir, settingSources, outputStyle, setupScript, runs, outDir, home }) {
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
    const runFolder = fs.mkdtempSync(path.join(os.tmpdir(), `pressure-${arm.name}-`));
    const [scratch, tmp] = ['scratch', 'tmp'].map((name) => path.join(runFolder, name));
    for (const dir of [scratch, tmp]) fs.mkdirSync(dir);
    const roots = [scratch, tmp];
    if (setupScript !== undefined) {
      const runCase = caseFolder(setupScript);
      fs.mkdirSync(runCase, { recursive: true });
      roots.push(runCase);
    }
    const settingsAt = arm.flags.indexOf('--settings');
    const armSettings = settingsAt === -1 ? undefined : JSON.parse(arm.flags[settingsAt + 1]);
    const settings = outputStyle === undefined ? armSettings : { ...armSettings, outputStyle };
    const pluginFlags = settingsAt === -1 ? arm.flags : arm.flags.filter((_, at) => at !== settingsAt && at !== settingsAt + 1);
    const args = claudeArguments({ model, effort, promptText, settingSources, pluginFlags });
    return runArm(withHome(confinedClaude({ args, roots, cwd: scratch, tmp, settings }), home));
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
    const tokens = outcome.tokens ? ` [tokens: in=${outcome.tokens.input} out=${outcome.tokens.output}]` : '';
    const total = totals.get(arm.name) ?? {};
    if (cost !== '') total.cost = (total.cost ?? 0) + outcome.cost;
    if (tokens !== '') total.tokens = { input: (total.tokens?.input ?? 0) + outcome.tokens.input, output: (total.tokens?.output ?? 0) + outcome.tokens.output };
    if (cost !== '' || tokens !== '') totals.set(arm.name, total);
    const unopened = outcome.unopened.map((citation) => ` [unopened citation: ${citation}]`).join('');
    console.log(`  ${arm.name} ${runNumber}: ${file} [first edit/write: ${outcome.firstAction ?? 'none'}] [skills: ${skills}]${cost}${tokens}${unopened}`);
    if (unopened !== '') failed = true;
    for (const dir of wrongCopies(outcome.skillDirs, arm.pluginDir)) {
      failed = true;
      console.log(`  WRONG COPY ${arm.name} ${runNumber}: ${dir} is not under ${arm.pluginDir}`);
    }
  });
  for (const [name, { cost, tokens }] of totals) {
    const parts = [cost === undefined ? '' : `$${cost.toFixed(4)}`, tokens ? `[tokens: in=${tokens.input} out=${tokens.output}]` : ''];
    console.log(`  total ${name}: ${parts.filter(Boolean).join(' ')}`);
  }
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
  if (process.env.CLAUDE_CONFIG_DIR) {
    console.error('usage: pressure.mjs: CLAUDE_CONFIG_DIR is set, but the default-options mirror covers only ~/.claude; unset it');
    process.exitCode = 2;
    return;
  }
  console.log(`answers: ${outDir}`);
  const home = makeDefaultOptionsHome();
  try {
    for (const cell of flags.cells) {
      if (await runCell(cell, promptText, { ...flags, outDir, home })) process.exitCode = 1;
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  await main();
}
