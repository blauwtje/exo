#!/usr/bin/env node
// Runs one pressure-scenario prompt on every model:effort cell, both without
// the skill and with it, so skills-tool's step 2 and step 4 stop reading N
// manual `claude -p` transcripts by hand. The with arm loads the clone
// through --plugin-dir; the without arm gets no --plugin-dir and disables
// the installed copy of the clone's plugin (`<plugin>@<marketplace>`, read
// from the clone's manifests) through --settings, since an installed and
// enabled plugin otherwise loads anyway. Each cell's two arms run in
// parallel in their own scratch directory outside the repository, matching
// pressure-scenarios.md:41; nothing here writes a case to disk beyond that
// temporary directory.
//
//   node pressure.mjs --prompt <file> --cells opus:high,sonnet:high --plugin-dir <clone>

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { UsageError, parseFlags } from '#script-flags';

const TRUNCATE_AT = 300;
const TIMEOUT_MS = 600_000;
const CELL_PATTERN = /^([^:]+):([^:]+)$/;
const ACTIONS = new Set(['Edit', 'Write']);

function readFlags(argv) {
  const flags = parseFlags(argv, { prompt: 'value', cells: 'value', 'plugin-dir': 'value' });
  if (!flags.prompt) throw new UsageError('--prompt needs a file');
  if (!flags.cells) throw new UsageError('--cells needs at least one model:effort pair');
  if (!flags['plugin-dir']) throw new UsageError('--plugin-dir needs a clone of the plugin');
  const cells = flags.cells.split(',').map((cell) => {
    const match = CELL_PATTERN.exec(cell);
    if (!match) throw new UsageError(`--cells entry '${cell}' needs the shape model:effort, got '${cell}'`);
    return { model: match[1], effort: match[2] };
  });
  const pluginDir = flags['plugin-dir'];
  return { promptFile: flags.prompt, cells, pluginDir, pluginId: installedPluginId(pluginDir) };
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

// The result of one arm's run: the final assistant text (undefined when the
// run never produced one, such as a timeout or a refusal) and the first
// Edit or Write tool call across the whole run, in order.
function parseStream(rawStdout) {
  let finalText;
  let firstAction = null;
  for (const line of rawStdout.split('\n')) {
    if (line.trim() === '') continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (firstAction === null && event.type === 'assistant') {
      const blocks = event.message?.content ?? [];
      const toolUse = blocks.find((block) => block.type === 'tool_use' && ACTIONS.has(block.name));
      if (toolUse) firstAction = `${toolUse.name} ${toolUse.input?.file_path ?? ''}`.trim();
    }
    if (event.type === 'result') finalText = typeof event.result === 'string' ? event.result : '';
  }
  return { finalText, firstAction };
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
      if (timedOut) {
        resolve({ finalText: undefined, firstAction: null, timedOut: true });
        return;
      }
      const parsed = parseStream(stdout);
      resolve({ ...parsed, timedOut: false, stderr });
    });
  });
}

function summarize(outcome) {
  if (outcome.timedOut) return `(timed out after ${TIMEOUT_MS / 1000}s)`;
  const text = outcome.finalText === undefined
    ? `(no result; stderr: ${outcome.stderr.trim().slice(0, TRUNCATE_AT) || 'empty'})`
    : outcome.finalText.slice(0, TRUNCATE_AT);
  const action = outcome.firstAction ?? 'none';
  return `${text} [first edit/write: ${action}]`;
}

async function runCell({ model, effort }, promptText, { pluginDir, pluginId }) {
  const scratchWithout = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-without-'));
  const scratchWith = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-with-'));
  const disableInstalled = JSON.stringify({ enabledPlugins: { [pluginId]: false } });
  const [without, withSkill] = await Promise.all([
    runArm(claudeArguments({ model, effort, promptText, armFlags: ['--settings', disableInstalled] }), scratchWithout),
    runArm(claudeArguments({ model, effort, promptText, armFlags: ['--plugin-dir', pluginDir] }), scratchWith)
  ]);
  console.log(`${model}:${effort}`);
  console.log(`  without: ${summarize(without)}`);
  console.log(`  with:    ${summarize(withSkill)}`);
}

async function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`usage: pressure.mjs --prompt <file> --cells <model:effort,...> --plugin-dir <clone>: ${error.message}`);
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
  for (const cell of flags.cells) {
    await runCell(cell, promptText, flags);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await main();
}
