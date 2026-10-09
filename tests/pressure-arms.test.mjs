// edit-skills's pressure runner gives both arms the same output style:
// --output-style sets `outputStyle` in the settings object each arm passes to
// the confined `claude`, beside the without arm's disabled plugin.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const PRESSURE = fileURLToPath(new URL('../skills/edit-skills/scripts/pressure.mjs', import.meta.url));

// Stands in for `claude`: answers with the settings object of its last
// --settings flag, or `none`.
const STAND_IN = [
  '#!/usr/bin/env node',
  "const at = process.argv.lastIndexOf('--settings');",
  "const settings = at === -1 ? 'none' : process.argv[at + 1];",
  "console.log(JSON.stringify({ type: 'result', result: settings }));"
].join('\n');

async function plugin(directory, name) {
  const clone = path.join(directory, name);
  await fs.mkdir(path.join(clone, '.claude-plugin'), { recursive: true });
  await fs.writeFile(path.join(clone, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'fixture-plugin' }));
  await fs.writeFile(path.join(clone, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: 'fixture-market' }));
  return clone;
}

async function armSettings(extraArgs) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'claude'), STAND_IN, { mode: 0o755 });
  const clone = await plugin(directory, 'clone');
  const promptFile = path.join(directory, 'prompt.txt');
  await fs.writeFile(promptFile, 'report');
  const out = await fixture();
  const args = ['--prompt', promptFile, '--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out];
  for (const arg of extraArgs) args.push(arg === '<main>' ? await plugin(directory, 'main') : arg);
  const outcome = await run(PRESSURE, args, {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, TMPDIR: await fixture(), CLAUDE_CONFIG_DIR: await fixture() }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
  const settings = {};
  for (const answer of await fs.readdir(out)) {
    const text = (await fs.readFile(path.join(out, answer), 'utf8')).trim();
    settings[answer] = text === 'none' ? 'none' : JSON.parse(text);
  }
  return settings;
}

const skipWindows = { skip: process.platform === 'win32' && 'the runner refuses on Windows' };

test('--output-style puts outputStyle in the settings of the with and without arms, keeping the disabled plugin', skipWindows, async () => {
  const settings = await armSettings(['--output-style', 'Explanatory']);
  assert.equal(settings['sonnet-high-with-1.md'].outputStyle, 'Explanatory');
  assert.equal(settings['sonnet-high-without-1.md'].outputStyle, 'Explanatory');
  assert.deepEqual(settings['sonnet-high-without-1.md'].enabledPlugins, { 'fixture-plugin@fixture-market': false });
});

test('--output-style puts outputStyle in the settings of the with and main arms', skipWindows, async () => {
  const settings = await armSettings(['--output-style', 'Explanatory', '--main-dir', '<main>']);
  assert.deepEqual(Object.keys(settings).sort(), ['sonnet-high-main-1.md', 'sonnet-high-with-1.md']);
  for (const [answer, value] of Object.entries(settings)) assert.equal(value.outputStyle, 'Explanatory', answer);
});

test('with no --output-style no arm gets an outputStyle', skipWindows, async () => {
  const settings = await armSettings([]);
  for (const [answer, value] of Object.entries(settings)) assert.ok(value === 'none' || !Object.hasOwn(value, 'outputStyle'), answer);
});

// Runs the runner once against a stand-in `claude` that answers `answer`
// without reading any file; returns the exit code and the arm line.
async function citationRun(answer) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  const standIn = `#!/usr/bin/env node\nconsole.log(JSON.stringify({ type: 'result', result: ${JSON.stringify(answer)} }));\n`;
  await fs.writeFile(path.join(bin, 'claude'), standIn, { mode: 0o755 });
  const clone = await plugin(directory, 'clone');
  const promptFile = path.join(directory, 'prompt.txt');
  await fs.writeFile(promptFile, 'report');
  const outcome = await run(PRESSURE, ['--prompt', promptFile, '--cells', 'sonnet:high', '--plugin-dir', clone, '--out', await fixture()], {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, TMPDIR: await fixture(), CLAUDE_CONFIG_DIR: await fixture() }
  });
  const line = outcome.stdout.split('\n').find((text) => text.startsWith('  with 1:')) ?? '';
  return { code: outcome.code, tags: [...line.matchAll(/\[unopened citation: ([^\]]+)\]/g)].map((match) => match[1]) };
}

test('a bare mention of an unread references path is not marked and leaves the exit 0', skipWindows, async () => {
  const outcome = await citationRun('See references/ghost.md and fixer-prompt.md for the rule.');
  assert.deepEqual(outcome, { code: 0, tags: [] });
});

test('an unread path with a :line suffix is marked without the suffix', skipWindows, async () => {
  const outcome = await citationRun('The rule sits at references/ghost.md:12 in that file.');
  assert.deepEqual(outcome, { code: 1, tags: ['references/ghost.md'] });
});

test('an unread path on a line that quotes text is marked, a bare one on another line is not', skipWindows, async () => {
  const outcome = await citationRun('references/bare.md says it.\nreferences/quoted.md says "keep it short".\n> references/block.md: also this');
  assert.deepEqual(outcome, { code: 1, tags: ['references/quoted.md', 'references/block.md'] });
});

// Runs the runner once against a stand-in `claude` whose result event carries
// `cost` (none when undefined) and any `extra` fields, with two runs per arm;
// returns the stdout lines.
async function costRun(cost, extra = {}) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  const event = { type: 'result', result: 'done', ...(cost === undefined ? {} : { total_cost_usd: cost }), ...extra };
  await fs.writeFile(path.join(bin, 'claude'), `#!/usr/bin/env node\nconsole.log(JSON.stringify(${JSON.stringify(event)}));\n`, { mode: 0o755 });
  const clone = await plugin(directory, 'clone');
  const promptFile = path.join(directory, 'prompt.txt');
  await fs.writeFile(promptFile, 'report');
  const outcome = await run(PRESSURE, ['--prompt', promptFile, '--cells', 'sonnet:high', '--plugin-dir', clone, '--runs', '2', '--out', await fixture()], {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, TMPDIR: await fixture(), CLAUDE_CONFIG_DIR: await fixture() }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
  return outcome.stdout.split('\n');
}

test('each arm line carries the result event cost and the cell ends on one total per arm', skipWindows, async () => {
  const lines = await costRun(0.25);
  const costs = lines.filter((text) => /^ {2}(with|without) \d:/.test(text)).map((text) => /\[cost: (\$[\d.]+)\]/.exec(text)?.[1]);
  assert.deepEqual(costs, ['$0.2500', '$0.2500', '$0.2500', '$0.2500']);
  assert.deepEqual(lines.filter((text) => text.includes('total')), ['  total without: $0.5000', '  total with: $0.5000']);
});

test('a result with no total_cost_usd gets no cost tag and no total', skipWindows, async () => {
  const lines = await costRun(undefined);
  assert.deepEqual(lines.filter((text) => text.includes('cost') || text.includes('tokens') || text.includes('total')), []);
});

test('each arm line carries usage tokens, cache counted as input, and the total sums them per arm', skipWindows, async () => {
  const usage = { input_tokens: 10, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000, output_tokens: 45 };
  const lines = await costRun(0.25, { usage });
  const tokens = lines.filter((text) => /^ {2}(with|without) \d:/.test(text)).map((text) => /\[cost: \$[\d.]+\] (\[tokens: [^\]]+\])/.exec(text)?.[1]);
  assert.deepEqual(tokens, Array(4).fill('[tokens: in=3210 out=45]'));
  assert.deepEqual(lines.filter((text) => text.includes('total')), ['  total without: $0.5000 [tokens: in=6420 out=90]', '  total with: $0.5000 [tokens: in=6420 out=90]']);
});

test('a usage block with no cost prints tokens alone, a missing count adding 0', skipWindows, async () => {
  const lines = await costRun(undefined, { usage: { input_tokens: 7 } });
  assert.deepEqual(lines.filter((text) => text.includes('total')), ['  total without: [tokens: in=14 out=0]', '  total with: [tokens: in=14 out=0]']);
});
