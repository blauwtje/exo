// skills-tool's pressure runner: one cell prints 3 lines, the without arm
// never sees --plugin-dir and disables the installed copy of the clone's
// plugin through --settings, the with arm always gets --plugin-dir and no
// --settings, and the first Edit or Write tool call in the stream is picked
// out for each arm.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const PRESSURE = fileURLToPath(new URL('../skills/skills-tool/scripts/pressure.mjs', import.meta.url));

// Stands in for `claude`: logs its arguments and prints a stream-json
// transcript picked by STAND_IN_MODE, one line per event.
const STAND_IN = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "fs.appendFileSync(process.env.STAND_IN_LOG, process.argv.slice(2).join(' ') + '\\n');",
  'const mode = process.env.STAND_IN_MODE;',
  "const assistantWithEdit = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/tmp/x.js' } }] } };",
  "const resultLine = (text) => ({ type: 'result', result: text });",
  "if (mode === 'plain') { console.log(JSON.stringify(resultLine('one should ask first'))); process.exit(0); }",
  "if (mode === 'edits') { console.log(JSON.stringify(assistantWithEdit)); console.log(JSON.stringify(resultLine('done, edited the file'))); process.exit(0); }",
  'process.exit(0);'
].join('\n');

const PLUGIN_NAME = 'fixture-plugin';
const MARKETPLACE_NAME = 'fixture-market';

// A plugin clone holding the two manifests pressure.mjs reads the installed
// plugin id from; a manifest named in `omit` is left out.
async function pluginClone({ omit = [] } = {}) {
  const clone = await fixture();
  const manifests = path.join(clone, '.claude-plugin');
  await fs.mkdir(manifests);
  const contents = { 'plugin.json': { name: PLUGIN_NAME }, 'marketplace.json': { name: MARKETPLACE_NAME } };
  for (const [file, manifest] of Object.entries(contents)) {
    if (omit.includes(file)) continue;
    await fs.writeFile(path.join(manifests, file), JSON.stringify(manifest));
  }
  return clone;
}

async function runPressure(mode, args) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'claude'), STAND_IN, { mode: 0o755 });
  const promptFile = path.join(directory, 'prompt.txt');
  await fs.writeFile(promptFile, 'a pressure scenario');
  const log = path.join(directory, 'calls.log');
  const outcome = await run(PRESSURE, ['--prompt', promptFile, ...args], {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, STAND_IN_LOG: log, STAND_IN_MODE: mode }
  });
  const logged = await fs.readFile(log, 'utf8').catch(() => '');
  return { ...outcome, calls: logged.split('\n').filter((line) => line !== '') };
}

test('a cell prints 3 lines: the cell label, the without arm, then the with arm', async () => {
  const clone = await pluginClone();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone]);
  assert.equal(outcome.code, 0, outcome.stderr);
  const lines = outcome.stdout.trim().split('\n');
  assert.equal(lines.length, 3, outcome.stdout);
  assert.equal(lines[0], 'sonnet:high');
  assert.match(lines[1], /^ {2}without: one should ask first/);
  assert.match(lines[2], /^ {2}with:    one should ask first/);
});

test('the without arm never gets --plugin-dir and the with arm always does', async () => {
  const clone = await pluginClone();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone]);
  assert.equal(outcome.calls.length, 2, outcome.calls.join('\n'));
  const withoutCall = outcome.calls.find((call) => !call.includes('--plugin-dir'));
  const withCall = outcome.calls.find((call) => call.includes('--plugin-dir'));
  assert.ok(withoutCall, outcome.calls.join('\n'));
  assert.ok(withCall.includes(`--plugin-dir ${clone}`), withCall);
});

test('the without arm disables the installed plugin through --settings and the with arm gets no --settings', async () => {
  const clone = await pluginClone();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone]);
  assert.equal(outcome.code, 0, outcome.stderr);
  const withoutCall = outcome.calls.find((call) => !call.includes('--plugin-dir'));
  const withCall = outcome.calls.find((call) => call.includes('--plugin-dir'));
  const settings = JSON.stringify({ enabledPlugins: { [`${PLUGIN_NAME}@${MARKETPLACE_NAME}`]: false } });
  assert.ok(withoutCall.includes(`--settings ${settings}`), withoutCall);
  assert.ok(!withCall.includes('--settings'), withCall);
});

test('the first Edit or Write tool call is named in the summary', async () => {
  const clone = await pluginClone();
  const outcome = await runPressure('edits', ['--cells', 'opus:max', '--plugin-dir', clone]);
  assert.match(outcome.stdout, /first edit\/write: Edit \/tmp\/x\.js/);
});

test('a malformed --cells entry is a usage error that runs no claude', async () => {
  const clone = await pluginClone();
  const outcome = await runPressure('plain', ['--cells', 'sonnet-high', '--plugin-dir', clone]);
  assert.equal(outcome.code, 2, outcome.stderr);
  assert.deepEqual(outcome.calls, []);
});

test('a missing --plugin-dir or --cells is a usage error', async () => {
  const clone = await pluginClone();
  for (const args of [['--cells', 'sonnet:high'], ['--plugin-dir', clone]]) {
    const outcome = await runPressure('plain', args);
    assert.equal(outcome.code, 2, args.join(' '));
  }
});

test('a missing plugin or marketplace manifest in the clone is a usage error naming the file', async () => {
  for (const file of ['plugin.json', 'marketplace.json']) {
    const clone = await pluginClone({ omit: [file] });
    const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone]);
    assert.equal(outcome.code, 2, outcome.stderr);
    assert.ok(outcome.stderr.includes(path.join(clone, '.claude-plugin', file)), outcome.stderr);
    assert.deepEqual(outcome.calls, []);
  }
});
