// skills-tool's pressure runner: the first line names the answers
// directory, each cell prints its label and one line per arm and run, every
// full answer lands untruncated in its own file there, each cell runs
// --runs times per arm, the without arm never sees --plugin-dir and disables
// the installed copy of the clone's plugin through --settings, the with arm
// always gets --plugin-dir and no --settings, and each arm line names the
// first Edit or Write tool call and every Skill tool call in the stream.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
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
  "const assistantWithSkill = (skill) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } });",
  "const resultLine = (text) => ({ type: 'result', result: text });",
  "if (mode === 'plain') { console.log(JSON.stringify(resultLine('one should ask first'))); process.exit(0); }",
  "if (mode === 'edits') { console.log(JSON.stringify(assistantWithEdit)); console.log(JSON.stringify(resultLine('done, edited the file'))); process.exit(0); }",
  "if (mode === 'skills') { console.log(JSON.stringify(assistantWithSkill('exo:debug'))); console.log(JSON.stringify(assistantWithSkill('exo:skills-tool'))); console.log(JSON.stringify(resultLine('used two skills'))); process.exit(0); }",
  "if (mode === 'long') { console.log(JSON.stringify(resultLine('a'.repeat(400) + ' middle ' + 'b'.repeat(400) + ' the end'))); process.exit(0); }",
  "if (mode === 'fails') { process.stderr.write('e'.repeat(400) + ' stderr tail'); process.exit(1); }",
  'process.exit(0);'
].join('\n');

const LONG_ANSWER = `${'a'.repeat(400)} middle ${'b'.repeat(400)} the end`;
const ARM_LINE = /^ {2}(without|with) (\d+): (\S+) \[first edit\/write: ([^\]]*)\] \[skills: ([^\]]*)\]$/;

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

// The arm lines of stdout, each parsed into its arm, run, answer file, first
// Edit or Write action and Skill calls.
function armLines(stdout) {
  return stdout.trim().split('\n').filter((line) => ARM_LINE.test(line)).map((line) => {
    const [, arm, runNumber, file, firstAction, skills] = ARM_LINE.exec(line);
    return { arm, run: Number(runNumber), file, firstAction, skills };
  });
}

test('a cell prints the answers directory, the cell label, then one line per arm and run, 3 runs by default', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out]);
  assert.equal(outcome.code, 0, outcome.stderr);
  const lines = outcome.stdout.trim().split('\n');
  assert.equal(lines.length, 8, outcome.stdout);
  assert.equal(lines[0], `answers: ${out}`);
  assert.equal(lines[1], 'sonnet:high');
  const expected = ['without 1', 'without 2', 'without 3', 'with 1', 'with 2', 'with 3'];
  assert.deepEqual(lines.slice(2).map((line) => ARM_LINE.exec(line)?.slice(1, 3).join(' ')), expected, outcome.stdout);
  for (const line of armLines(outcome.stdout)) {
    assert.equal(line.file, path.join(out, `sonnet-high-${line.arm}-${line.run}.md`));
    assert.equal(await fs.readFile(line.file, 'utf8'), 'one should ask first');
    assert.equal(line.firstAction, 'none');
    assert.equal(line.skills, 'none');
  }
  assert.equal(outcome.calls.length, 6, outcome.calls.join('\n'));
});

test('--runs 2 makes 4 claude calls for one cell and prints 4 arm lines', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out, '--runs', '2']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.calls.length, 4, outcome.calls.join('\n'));
  const lines = armLines(outcome.stdout);
  assert.deepEqual(lines.map((line) => `${line.arm} ${line.run}`), ['without 1', 'without 2', 'with 1', 'with 2']);
  assert.deepEqual((await fs.readdir(out)).sort(), [
    'sonnet-high-with-1.md', 'sonnet-high-with-2.md', 'sonnet-high-without-1.md', 'sonnet-high-without-2.md'
  ]);
});

test('--runs 0, x, 1.5 or -1 is a usage error that runs no claude', async () => {
  const clone = await pluginClone();
  for (const runs of ['0', 'x', '1.5', '-1']) {
    const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--runs', runs]);
    assert.equal(outcome.code, 2, `--runs ${runs}: ${outcome.stderr}`);
    assert.equal(outcome.stdout, '', `--runs ${runs}`);
    assert.deepEqual(outcome.calls, [], `--runs ${runs}`);
  }
});

test('an answer longer than 300 characters lands whole in its file', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('long', ['--cells', 'opus:max', '--plugin-dir', clone, '--out', out, '--runs', '1']);
  assert.equal(outcome.code, 0, outcome.stderr);
  const lines = armLines(outcome.stdout);
  assert.equal(lines.length, 2, outcome.stdout);
  for (const line of lines) {
    assert.equal(await fs.readFile(line.file, 'utf8'), LONG_ANSWER);
  }
});

test('a run with no result writes a note holding the full stderr to its file', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('fails', ['--cells', 'opus:max', '--plugin-dir', clone, '--out', out, '--runs', '1']);
  assert.equal(outcome.code, 0, outcome.stderr);
  const lines = armLines(outcome.stdout);
  assert.equal(lines.length, 2, outcome.stdout);
  for (const line of lines) {
    const note = await fs.readFile(line.file, 'utf8');
    assert.ok(note.includes(`${'e'.repeat(400)} stderr tail`), note);
  }
});

test('without --out the answers land in a fresh directory under the system temporary directory', async () => {
  const clone = await pluginClone();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--runs', '1']);
  assert.equal(outcome.code, 0, outcome.stderr);
  const out = /^answers: (.+)$/m.exec(outcome.stdout)?.[1];
  assert.ok(out, outcome.stdout);
  try {
    assert.ok(out.startsWith(os.tmpdir()), out);
    assert.equal((await fs.readdir(out)).length, 2);
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
});

test('the without arm never gets --plugin-dir and the with arm always does', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out, '--runs', '1']);
  assert.equal(outcome.calls.length, 2, outcome.calls.join('\n'));
  const withoutCall = outcome.calls.find((call) => !call.includes('--plugin-dir'));
  const withCall = outcome.calls.find((call) => call.includes('--plugin-dir'));
  assert.ok(withoutCall, outcome.calls.join('\n'));
  assert.ok(withCall.includes(`--plugin-dir ${clone}`), withCall);
});

test('the without arm disables the installed plugin through --settings and the with arm gets no --settings', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out, '--runs', '1']);
  assert.equal(outcome.code, 0, outcome.stderr);
  const withoutCall = outcome.calls.find((call) => !call.includes('--plugin-dir'));
  const withCall = outcome.calls.find((call) => call.includes('--plugin-dir'));
  const settings = JSON.stringify({ enabledPlugins: { [`${PLUGIN_NAME}@${MARKETPLACE_NAME}`]: false } });
  assert.ok(withoutCall.includes(`--settings ${settings}`), withoutCall);
  assert.ok(!withCall.includes('--settings'), withCall);
});

test('the first Edit or Write tool call is named in each arm line', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('edits', ['--cells', 'opus:max', '--plugin-dir', clone, '--out', out, '--runs', '1']);
  const lines = armLines(outcome.stdout);
  assert.equal(lines.length, 2, outcome.stdout);
  for (const line of lines) assert.equal(line.firstAction, 'Edit /tmp/x.js');
});

test('every Skill tool call in the stream is listed in each arm line', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('skills', ['--cells', 'opus:max', '--plugin-dir', clone, '--out', out, '--runs', '1']);
  const lines = armLines(outcome.stdout);
  assert.equal(lines.length, 2, outcome.stdout);
  for (const line of lines) assert.equal(line.skills, 'exo:debug, exo:skills-tool');
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
