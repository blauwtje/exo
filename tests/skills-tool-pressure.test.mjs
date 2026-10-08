// edit-skills's pressure runner: the first line names the answers
// directory, each cell prints its label and one line per arm and run, every
// full answer lands untruncated in its own file there, each cell runs
// --runs times per arm, the without arm never sees --plugin-dir and disables
// the installed copy of the clone's plugin through --settings, the with arm
// always gets --plugin-dir and no --settings, and each arm line names the
// first Edit or Write tool call and every Skill tool call in the stream.
// --setup runs its script before every run and runs them one at a time.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const PRESSURE = fileURLToPath(new URL('../skills/edit-skills/scripts/pressure.mjs', import.meta.url));

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
  "if (mode === 'skills') { console.log(JSON.stringify(assistantWithSkill('exo:find-cause'))); console.log(JSON.stringify(assistantWithSkill('exo:edit-skills'))); console.log(JSON.stringify(resultLine('used two skills'))); process.exit(0); }",
  "if (mode === 'long') { console.log(JSON.stringify(resultLine('a'.repeat(400) + ' middle ' + 'b'.repeat(400) + ' the end'))); process.exit(0); }",
  "if (mode === 'loads') { const dir = process.env.STAND_IN_BASE ?? process.argv[process.argv.indexOf('--plugin-dir') + 1] + '/skills/spec'; console.log(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: ' + dir + '\\n\\n# Skill' }] } })); console.log(JSON.stringify(resultLine('loaded a skill'))); process.exit(0); }",
  "if (mode === 'cites') { console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/clone/skills/spec/references/opened.md' } }, { type: 'tool_use', name: 'Read', input: { file_path: '/clone/skills/find-cause/fixer-prompt.md' } }] } })); console.log(JSON.stringify(resultLine('Per references/opened.md and skills/spec/references/opened.md, plus fixer-prompt.md, but also references/ghost.md and /clone/other-prompt.md.'))); process.exit(0); }",
  "if (mode === 'paced') { setTimeout(() => { fs.appendFileSync(process.env.STAND_IN_LOG, 'end\\n'); console.log(JSON.stringify(resultLine('paced answer'))); }, 100); return; }",
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

// `args` is a list, or a function of the runner's cwd that returns one.
async function runPressure(mode, args, extraEnv = {}) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'claude'), STAND_IN, { mode: 0o755 });
  const promptFile = path.join(directory, 'prompt.txt');
  await fs.writeFile(promptFile, 'a pressure scenario');
  const log = path.join(directory, 'calls.log');
  const argList = typeof args === 'function' ? args(directory) : args;
  const outcome = await run(PRESSURE, ['--prompt', promptFile, ...argList], {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, STAND_IN_LOG: log, STAND_IN_MODE: mode, ...extraEnv }
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

test('a cell prints the answers directory, the cell label, then one line per arm and run, 1 run by default', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out]);
  assert.equal(outcome.code, 0, outcome.stderr);
  const lines = outcome.stdout.trim().split('\n');
  assert.equal(lines.length, 4, outcome.stdout);
  assert.equal(lines[0], `answers: ${out}`);
  assert.equal(lines[1], 'sonnet:high');
  const expected = ['without 1', 'with 1'];
  assert.deepEqual(lines.slice(2).map((line) => ARM_LINE.exec(line)?.slice(1, 3).join(' ')), expected, outcome.stdout);
  for (const line of armLines(outcome.stdout)) {
    assert.equal(line.file, path.join(out, `sonnet-high-${line.arm}-${line.run}.md`));
    assert.equal(await fs.readFile(line.file, 'utf8'), 'one should ask first');
    assert.equal(line.firstAction, 'none');
    assert.equal(line.skills, 'none');
  }
  assert.equal(outcome.calls.length, 2, outcome.calls.join('\n'));
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

test('every call gets --strict-mcp-config so a user\'s MCP servers cannot steer a run', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out, '--runs', '1']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.calls.length, 2, outcome.calls.join('\n'));
  for (const call of outcome.calls) assert.ok(call.includes('--strict-mcp-config'), call);
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
  for (const line of lines) assert.equal(line.skills, 'exo:find-cause, exo:edit-skills');
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

test('a relative --plugin-dir reaches claude as the absolute path it names from the caller\'s cwd', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('plain', (cwd) => ['--cells', 'sonnet:high', '--plugin-dir', path.relative(cwd, clone), '--out', out, '--runs', '1']);
  assert.equal(outcome.code, 0, outcome.stderr);
  const withCall = outcome.calls.find((call) => call.includes('--plugin-dir'));
  // The runner's cwd is the realpath of the fixture, such as /private/var on macOS.
  assert.ok(withCall.endsWith(`--plugin-dir ${await fs.realpath(clone)}`), withCall);
});

test('a --plugin-dir or --main-dir with no plugin manifest is a usage error naming the absolute manifest path', async () => {
  const clone = await pluginClone();
  const empty = await fixture();
  for (const args of [['--plugin-dir', empty], ['--plugin-dir', clone, '--main-dir', empty]]) {
    const outcome = await runPressure('plain', ['--cells', 'sonnet:high', ...args]);
    assert.equal(outcome.code, 2, outcome.stderr);
    assert.ok(outcome.stderr.includes(path.join(empty, '.claude-plugin', 'plugin.json')), outcome.stderr);
    assert.deepEqual(outcome.calls, []);
  }
});

test('--main-dir turns the without arm into a main arm that loads the second copy through --plugin-dir', async () => {
  const clone = await pluginClone();
  const main = await pluginClone();
  const out = await fixture();
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--main-dir', main, '--out', out, '--runs', '1']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.ok(outcome.calls.some((call) => call.includes(`--plugin-dir ${main}`)), outcome.calls.join('\n'));
  assert.ok(outcome.calls.some((call) => call.includes(`--plugin-dir ${clone}`)), outcome.calls.join('\n'));
  assert.ok(outcome.calls.every((call) => !call.includes('--settings')), outcome.calls.join('\n'));
  assert.match(outcome.stdout, /^ {2}main 1: /m);
  assert.doesNotMatch(outcome.stdout, /without/);
});

test('--setting-sources reaches every run of both arms, and is absent when not given', async () => {
  const clone = await pluginClone();
  const main = await pluginClone();
  const out = await fixture();
  const given = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--main-dir', main, '--setting-sources', 'project,local', '--out', out, '--runs', '2']);
  assert.equal(given.code, 0, given.stderr);
  assert.equal(given.calls.length, 4, given.calls.join('\n'));
  assert.ok(given.calls.every((call) => call.includes('--setting-sources project,local')), given.calls.join('\n'));
  const omitted = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', await fixture(), '--runs', '1']);
  assert.equal(omitted.code, 0, omitted.stderr);
  assert.ok(omitted.calls.every((call) => !call.includes('--setting-sources')), omitted.calls.join('\n'));
});

test('a skill loaded from outside the arm\'s copy prints a WRONG COPY line and exits 1', async () => {
  const clone = await pluginClone();
  const main = await pluginClone();
  const out = await fixture();
  const args = ['--cells', 'sonnet:high', '--plugin-dir', clone, '--main-dir', main, '--out', out, '--runs', '1'];
  const wrong = await runPressure('loads', args, { STAND_IN_BASE: path.join(main, 'skills', 'spec') });
  assert.equal(wrong.code, 1, wrong.stderr);
  const wrongLines = wrong.stdout.split('\n').filter((line) => line.includes('WRONG COPY'));
  assert.equal(wrongLines.length, 1, wrong.stdout);
  assert.ok(wrongLines.includes(`  WRONG COPY with 1: ${path.join(main, 'skills', 'spec')} is not under ${clone}`), wrong.stdout);
  const right = await runPressure('loads', args);
  assert.equal(right.code, 0, right.stderr);
  assert.doesNotMatch(right.stdout, /WRONG COPY/);
});

// A setup script, in its own directory, that runs `body` under bash.
async function setupScript(body) {
  const script = path.join(await fixture(), 'setup.sh');
  await fs.writeFile(script, body);
  return script;
}

test('--setup runs the script right before every run, and the runs go one at a time, alternating arms', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const script = await setupScript('echo setup >> "$STAND_IN_LOG"\necho rebuilt\n');
  const outcome = await runPressure('paced', (cwd) => ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out, '--runs', '2', '--setup', path.relative(cwd, script)]);
  assert.equal(outcome.code, 0, outcome.stderr);
  const steps = outcome.calls.map((call) => {
    if (call === 'setup' || call === 'end') return call;
    return call.includes('--plugin-dir') ? 'with' : 'without';
  });
  assert.deepEqual(steps, [
    'setup', 'without', 'end', 'setup', 'with', 'end', 'setup', 'without', 'end', 'setup', 'with', 'end'
  ], outcome.calls.join('\n'));
  const lines = armLines(outcome.stdout);
  assert.deepEqual(lines.map((line) => `${line.arm} ${line.run}`), ['without 1', 'without 2', 'with 1', 'with 2']);
  assert.doesNotMatch(outcome.stdout, /rebuilt/);
  for (const line of lines) assert.equal(await fs.readFile(line.file, 'utf8'), 'paced answer');
});

test('a --setup that exits non-zero skips its run, notes its stderr, marks the line failed and exits 1', async () => {
  const clone = await pluginClone();
  const out = await fixture();
  const script = await setupScript('echo broken fixture >&2\nexit 3\n');
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out, '--runs', '1', '--setup', script]);
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.deepEqual(outcome.calls, []);
  for (const arm of ['without', 'with']) {
    const file = path.join(out, `sonnet-high-${arm}-1.md`);
    assert.ok(outcome.stdout.includes(`  ${arm} 1: ${file} [setup failed: exit 3]`), outcome.stdout);
    const note = await fs.readFile(file, 'utf8');
    assert.ok(note.includes('broken fixture'), note);
  }
});

test('a --setup naming no file is a usage error that runs no claude', async () => {
  const clone = await pluginClone();
  const missing = path.join(await fixture(), 'no-such-setup.sh');
  const outcome = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--setup', missing]);
  assert.equal(outcome.code, 2, outcome.stderr);
  assert.ok(outcome.stderr.includes(missing), outcome.stderr);
  assert.equal(outcome.stdout, '');
  assert.deepEqual(outcome.calls, []);
});

test('an answer naming a references or prompt file the run never read gets an unopened-citation tag and the runner exits 1', async () => {
  const clone = await pluginClone();
  const cited = await runPressure('cites', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', await fixture()]);
  assert.equal(cited.code, 1, cited.stderr);
  const line = cited.stdout.split('\n').find((text) => text.startsWith('  with 1:'));
  const tags = [...line.matchAll(/\[unopened citation: ([^\]]+)\]/g)].map((match) => match[1]);
  assert.deepEqual(tags, ['references/ghost.md', '/clone/other-prompt.md'], line);
  const plain = await runPressure('plain', ['--cells', 'sonnet:high', '--plugin-dir', clone, '--out', await fixture()]);
  assert.equal(plain.code, 0, plain.stderr);
  assert.doesNotMatch(plain.stdout, /unopened citation/);
});

// The cells line `--cells-for <file>` prints, from the real kind table.
function cellsFor(file) {
  return run(PRESSURE, ['--cells-for', file]);
}

test('--cells-for prints the kind\'s cell and each budget replacement as a --cells value', async () => {
  const critic = await cellsFor('agents/critique-ui.md');
  assert.equal(critic.code, 0, critic.stderr);
  assert.equal(critic.stdout, 'opus:high,sonnet:high,opus:xhigh\n');
  const build = await cellsFor('agents/build-task.md');
  assert.equal(build.stdout, 'sonnet:high\n');
});

test('--cells-for adds every per-call kind a budget runs the file on, deep and high review and the hard twins', async () => {
  assert.equal((await cellsFor('agents/review-branch.md')).stdout, 'sonnet:high,opus:high,opus:xhigh\n');
  assert.equal((await cellsFor('agents/solve-hard.md')).stdout, 'opus:high,sonnet:high,opus:xhigh,opus:medium\n');
});

test('--cells-for prints session for a kind with no effort, and a dispatches entry\'s kind for its file', async () => {
  assert.equal((await cellsFor('agents/locate-code.md')).stdout, 'haiku:session\n');
  assert.equal((await cellsFor('skills/find-cause/fixer-prompt.md')).stdout, 'sonnet:high\n');
  assert.equal((await cellsFor('skills/configure/SKILL.md')).stdout, 'sonnet:low\n');
});

test('--cells-for a file no kind lists is a usage error with an empty stdout', async () => {
  const outcome = await cellsFor('skills/no-such/SKILL.md');
  assert.equal(outcome.code, 2, outcome.stderr);
  assert.equal(outcome.stdout, '');
  assert.ok(outcome.stderr.includes('skills/no-such/SKILL.md'), outcome.stderr);
});
