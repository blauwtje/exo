#!/usr/bin/env node
// Runs one pressure-scenario prompt on every model:effort cell, both without
// the skill and with it, --runs times per arm (default 3), so edit-skills's
// step 2 and step 4 stop reading N manual `claude -p` transcripts by hand.
// The with arm loads the clone through --plugin-dir; the without arm gets no
// --plugin-dir and disables the installed copy of the clone's plugin
// (`<plugin>@<marketplace>`, read from the clone's manifests) through
// --settings, since an installed and enabled plugin otherwise loads anyway.
// Every run of both arms of a cell runs in parallel, each in its own scratch
// directory outside the repository, matching pressure-scenarios.md:41; cells
// run one after another.
//
// Each run's full final answer, untruncated, goes to its own file
// `<model>-<effort>-<arm>-<run>.md` in the --out directory (default a fresh
// temporary directory outside any repository); a timeout or a run with no
// result gets a note holding the full stderr instead. stdout opens with
// `answers: <dir>`, then per cell its label and one line per arm and run:
//
//   without 1: <file> [first edit/write: Edit /x.js] [skills: exo:find-cause]
//
//   node pressure.mjs --prompt <file> --cells opus:high,sonnet:high --plugin-dir <clone> [--runs 3] [--out <dir>]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { UsageError, parseFlags } from '#script-flags';

const TIMEOUT_MS = 600_000;
const DEFAULT_RUNS = 3;
const CELL_PATTERN = /^([^:]+):([^:]+)$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const ACTIONS = new Set(['Edit', 'Write']);
const USAGE = 'usage: pressure.mjs --prompt <file> --cells <model:effort,...> --plugin-dir <clone> [--runs <n>] [--out <dir>]';

function readFlags(argv) {
  const flags = parseFlags(argv, { prompt: 'value', cells: 'value', 'plugin-dir': 'value', runs: 'value', out: 'value' });
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
  const pluginDir = flags['plugin-dir'];
  return {
    promptFile: flags.prompt,
    cells,
    pluginDir,
    pluginId: installedPluginId(pluginDir),
    runs: flags.runs === undefined ? DEFAULT_RUNS : Number(flags.runs),
    outDir: flags.out
  };
}

function manifestName(pluginDir, file) {
  const manifestPath = path.join(pluginDir, '.claude-plugin', file);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new UsageError(`--plugin-dir needs a readable '${manifestPath}': ${error.message}`);
  }
  if (typeof manifest?.name !== 'string' || manifest.name === '') {
    throw new UsageError(`--plugin-dir needs a 'name' in '${manifestPath}'`);
  }
  return manifest.name;
}

// The id under which an installed copy of the clone's plugin sits in
// `enabledPlugins`, such as `exo@blauwtje`.
function installedPluginId(pluginDir) {
  return `${manifestName(pluginDir, 'plugin.json')}@${manifestName(pluginDir, 'marketplace.json')}`;
}

function claudeArguments({ model, effort, promptText, armFlags }) {
  const args = [
    '-p', promptText,
    '--model', model,
    '--effort', effort,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'bypassPermissions'
  ];
  args.push(...armFlags);
  return args;
}

// The result of one run: the final assistant text (undefined when the run
// never produced one, such as a timeout or a refusal), the first Edit or
// Write tool call across the whole stream, and the `skill` input of every
// Skill tool call, in order.
function parseStream(rawStdout) {
  let finalText;
  let firstAction = null;
  const skills = [];
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
        if (toolUse.name === 'Skill') skills.push(String(toolUse.input?.skill ?? ''));
      }
    }
    if (event.type === 'result') finalText = typeof event.result === 'string' ? event.result : '';
  }
  return { finalText, firstAction, skills };
}

function runArm(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
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

// The answer file's content: the full final answer, or a note holding the
// full stderr when the run timed out or produced no result.
function answerText(outcome) {
  const stderr = outcome.stderr.trim() || 'empty';
  if (outcome.timedOut) return `(timed out after ${TIMEOUT_MS / 1000}s)\n\nstderr:\n${stderr}\n`;
  if (outcome.finalText === undefined) return `(no result)\n\nstderr:\n${stderr}\n`;
  return outcome.finalText;
}

// A file-name-safe form of one cell value, since a model id may hold
// characters such as `[` or `/`.
function fileSafe(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function runCell({ model, effort }, promptText, { pluginDir, pluginId, runs, outDir }) {
  const disableInstalled = JSON.stringify({ enabledPlugins: { [pluginId]: false } });
  const arms = [
    { name: 'without', flags: ['--settings', disableInstalled] },
    { name: 'with', flags: ['--plugin-dir', pluginDir] }
  ];
  const planned = arms.flatMap((arm) => Array.from({ length: runs }, (_, index) => ({ arm, runNumber: index + 1 })));
  const outcomes = await Promise.all(planned.map(({ arm }) => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `pressure-${arm.name}-`));
    return runArm(claudeArguments({ model, effort, promptText, armFlags: arm.flags }), scratch);
  }));
  console.log(`${model}:${effort}`);
  planned.forEach(({ arm, runNumber }, index) => {
    const outcome = outcomes[index];
    const file = path.join(outDir, `${fileSafe(model)}-${fileSafe(effort)}-${arm.name}-${runNumber}.md`);
    fs.writeFileSync(file, answerText(outcome));
    const skills = outcome.skills.length > 0 ? outcome.skills.join(', ') : 'none';
    console.log(`  ${arm.name} ${runNumber}: ${file} [first edit/write: ${outcome.firstAction ?? 'none'}] [skills: ${skills}]`);
  });
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
    await runCell(cell, promptText, { ...flags, outDir });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await main();
}
