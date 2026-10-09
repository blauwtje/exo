// The compression-* benchmark arms carry the compression rule text from the configure
// schema, so a cell measures each level as a session receives it.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ARMS, DEFAULT_ARMS } from '../benchmarks/tasks.mjs';
import { VARIANTS } from '../benchmarks/variants.mjs';

const SCHEMA = JSON.parse(fs.readFileSync(new URL('../skills/configure/schema.json', import.meta.url), 'utf8'));

test('compression-low arm prompts with the low rule from the schema, and no compression-high arm remains', () => {
  assert.equal(ARMS['compression-low'].prompt, SCHEMA.compression.rules.low);
  assert.deepEqual(ARMS['compression-low'].pluginDirs, []);
  assert.equal(ARMS['compression-high'], undefined);
});

// The cut arms of the task runner (benchmarks/run.mjs).

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RUN = path.join(ROOT, 'benchmarks', 'run.mjs');
const ARM_NAMES = ['exo-pointer', 'exo-no-find-cause'];

test('the cut arms load exo with a variant', () => {
  assert.equal(ARMS['exo-pointer'].variant, 'session-pointer');
  assert.equal(ARMS['exo-no-find-cause'].variant, 'no-find-cause');
  for (const name of ARM_NAMES) {
    assert.deepEqual(ARMS[name].pluginDirs, ARMS.exo.pluginDirs, name);
    assert.ok(!DEFAULT_ARMS.includes(name), `${name} stays out of the default arms`);
    if (ARMS[name].variant) assert.ok(ARMS[name].variant in VARIANTS, name);
  }
});

function dryRun(...args) {
  return spawnSync(process.execPath, [RUN, '--dry-run', '--model', 'sonnet', ...args], { encoding: 'utf8' });
}

test('a dry run loads a variant copy for the cut arms and the plain copy for exo', () => {
  const run = dryRun('--tasks', 'value-test-pollution', '--arms', 'exo,exo-pointer,exo-no-find-cause');
  assert.equal(run.status, 0, run.stderr);
  const line = (arm) => run.stdout.split('\n').find((row) => row.startsWith(`value-test-pollution ${arm} `));
  assert.match(line('exo-pointer'), /with variant session-pointer/);
  assert.match(line('exo-no-find-cause'), /with variant no-find-cause/);
  assert.doesNotMatch(line('exo'), /variant/);
});

test('--full keeps an explicit --runs and defaults to four otherwise', () => {
  const cells = (args) => Number(/^(\d+) cells planned/.exec(spawnSync(process.execPath, [RUN, '--full', '--model', 'sonnet', '--tasks', 'value-test-pollution', '--arms', 'baseline', ...args], { encoding: 'utf8' }).stdout)?.[1]);
  assert.equal(cells(['--runs', '5']), 5);
  assert.equal(cells([]), 4);
});

test('a cell loads the arm\'s variant copy', (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-arms-test-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const bin = path.join(scratch, 'bin');
  fs.mkdirSync(bin);
  // A stand-in claude: records its plugin folder, that folder's session hook and
  // the cell's exo settings, then answers like a finished session.
  fs.writeFileSync(path.join(bin, 'claude'), [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    "if (process.argv.includes('--version')) { console.log('0.0.0 (fake)'); process.exit(0); }",
    "const plugin = process.argv[process.argv.indexOf('--plugin-dir') + 1];",
    "const settings = fs.existsSync('.claude/exo.local.json') ? JSON.parse(fs.readFileSync('.claude/exo.local.json', 'utf8')) : null;",
    // The confined run writes nowhere outside its cell, so the stub reports on stderr, which run.mjs keeps as the cell's stderr.log.
    "process.stderr.write(`${JSON.stringify({ plugin, pointer: fs.readFileSync(`${plugin}/hooks/session-start.mjs`, 'utf8').includes('exo skills, invoked as'), settings })}\\n`);",
    "console.log(JSON.stringify({ result: 'done', total_cost_usd: 0 }));"
  ].join('\n'));
  fs.chmodSync(path.join(bin, 'claude'), 0o755);
  const run = spawnSync(process.execPath, [RUN, '--tasks', 'value-test-pollution', '--arms', 'exo,exo-pointer', '--model', 'sonnet', '--concurrency', '1', '--out', path.join(scratch, 'out')], {
    encoding: 'utf8',
    // A home of its own, so the cell's transcript folder lands in its .claude, not the user's ~/.claude/projects.
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: fs.mkdirSync(path.join(scratch, 'home'), { recursive: true }) }
  });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  const out = path.join(scratch, 'out');
  const logs = fs.readdirSync(out, { recursive: true }).filter((entry) => entry.endsWith('stderr.log'));
  const cells = ['exo', 'exo-pointer'].map((arm) => logs.find((entry) => entry.split(path.sep).includes(arm)))
    .map((entry) => JSON.parse(fs.readFileSync(path.join(out, entry), 'utf8').trim()));
  assert.equal(cells.length, 2);
  const [exo, pointer] = cells;
  assert.deepEqual(exo.settings, { workspace: 'current', ship: 'local' });
  assert.notEqual(exo.plugin, pointer.plugin);
  assert.deepEqual([exo.pointer, pointer.pointer], [false, true]);
  assert.ok(![exo, pointer].some((cell) => cell.plugin === ROOT.replace(/\/$/, '')));
});
