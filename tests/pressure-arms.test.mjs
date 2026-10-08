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
  const settings = await armSettings(['--output-style', 'exo:scannable']);
  assert.equal(settings['sonnet-high-with-1.md'].outputStyle, 'exo:scannable');
  assert.equal(settings['sonnet-high-without-1.md'].outputStyle, 'exo:scannable');
  assert.deepEqual(settings['sonnet-high-without-1.md'].enabledPlugins, { 'fixture-plugin@fixture-market': false });
});

test('--output-style puts outputStyle in the settings of the with and main arms', skipWindows, async () => {
  const settings = await armSettings(['--output-style', 'exo:scannable', '--main-dir', '<main>']);
  assert.deepEqual(Object.keys(settings).sort(), ['sonnet-high-main-1.md', 'sonnet-high-with-1.md']);
  for (const [answer, value] of Object.entries(settings)) assert.equal(value.outputStyle, 'exo:scannable', answer);
});

test('with no --output-style no arm gets an outputStyle', skipWindows, async () => {
  const settings = await armSettings([]);
  for (const [answer, value] of Object.entries(settings)) assert.ok(value === 'none' || !Object.hasOwn(value, 'outputStyle'), answer);
});
