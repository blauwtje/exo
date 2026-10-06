// harnesses/codex/run.mjs fixes the host and root, then runs only a
// skills/<name>/scripts/*.mjs file inside its own root, named relative to it or by
// its absolute path: a path outside, a symlink escaping the root or any other file
// exits 1 before the file is imported.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { generateTree } from '../harnesses/codex/generate.mjs';

const ROOT = new URL('../', import.meta.url).pathname;

const STUB = [
  "import fs from 'node:fs';",
  "import process from 'node:process';",
  "if (process.env.MARKER) fs.writeFileSync(process.env.MARKER, 'imported');",
  'process.stdout.write(JSON.stringify({ host: process.env.EXO_HOST, root: process.env.CLAUDE_PLUGIN_ROOT, entry: process.argv[1], args: process.argv.slice(2) }));'
].join('\n');

// A root of stub scripts, so the test sees what the launcher hands the script.
// The root name carries a space and shell metacharacters to prove it stays data.
function stubRoot() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-run-')));
  const root = path.join(base, 'ex o$(x)');
  fs.mkdirSync(path.join(root, 'harnesses', 'codex'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'harnesses', 'codex', 'run.mjs'), path.join(root, 'harnesses', 'codex', 'run.mjs'));
  fs.mkdirSync(path.join(root, 'skills', 'demo', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'demo', 'scripts', 'ok.mjs'), STUB);
  fs.writeFileSync(path.join(root, 'skills', 'demo', 'scripts', 'data.json'), '{}');
  fs.writeFileSync(path.join(root, 'hooks', 'other.mjs'), STUB);
  fs.writeFileSync(path.join(base, 'outside.mjs'), STUB);
  return { base, root, marker: path.join(base, 'marker') };
}

function run(fixture, args, env = {}) {
  const launcher = path.join(fixture.root, 'harnesses', 'codex', 'run.mjs');
  return spawnSync(process.execPath, [launcher, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, MARKER: fixture.marker, ...env }
  });
}

function assertRefused(fixture, args) {
  const result = run(fixture, args);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /run:/);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(fixture.marker), false, 'the refused file was imported');
}

test('runs a skill script as codex with the root and the remaining arguments', () => {
  const fixture = stubRoot();
  const payload = '$(touch pwned);`touch pwned`;"\'&|';
  const result = run(fixture, ['skills/demo/scripts/ok.mjs', '--flag', payload, ''], { EXO_HOST: 'claude', CLAUDE_PLUGIN_ROOT: '/elsewhere' });
  assert.equal(result.status, 0, result.stderr);
  const seen = JSON.parse(result.stdout);
  assert.equal(seen.host, 'codex');
  assert.equal(seen.root, fixture.root);
  assert.equal(seen.entry, path.join(fixture.root, 'skills', 'demo', 'scripts', 'ok.mjs'));
  assert.deepEqual(seen.args, ['--flag', payload, '']);
  assert.equal(fs.existsSync(path.join(process.cwd(), 'pwned')), false);
});

test('runs a listed lib entry as codex and refuses an unlisted lib file', () => {
  const fixture = stubRoot();
  fs.mkdirSync(path.join(fixture.root, 'lib'));
  fs.writeFileSync(path.join(fixture.root, 'lib', 'workspace.mjs'), STUB);
  fs.writeFileSync(path.join(fixture.root, 'lib', 'helper.mjs'), STUB);
  const result = run(fixture, ['lib/workspace.mjs', 'decide'], { EXO_HOST: 'claude' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).host, 'codex');
  fs.rmSync(fixture.marker);
  assertRefused(fixture, ['lib/helper.mjs']);
});

test('every lib file a generated command runs is a launcher entry', () => {
  const launcher = fs.readFileSync(path.join(ROOT, 'harnesses', 'codex', 'run.mjs'), 'utf8');
  const command = /run\.mjs" "\{\{EXO_ROOT\}\}\/(lib\/[^"]+\.mjs)"/g;
  for (const [file, text] of generateTree(ROOT)) {
    for (const [, entry] of text.matchAll(command)) assert.ok(launcher.includes(`'${entry}'`), `${file} runs ${entry}, which run.mjs does not list`);
  }
});

test('refuses a path outside the root', () => {
  const fixture = stubRoot();
  assertRefused(fixture, ['skills/demo/scripts/../../../../outside.mjs']);
  assertRefused(fixture, ['../outside.mjs']);
  assertRefused(fixture, [path.join(fixture.base, 'outside.mjs')]);
  assertRefused(fixture, [path.join(fixture.root, 'skills', 'demo', 'scripts', '..', '..', '..', '..', 'outside.mjs')]);
  assertRefused(fixture, [`${fixture.root}-sibling/skills/demo/scripts/ok.mjs`]);
});

test('runs the absolute root-prefixed path the generated skills carry', () => {
  const fixture = stubRoot();
  const script = path.join(fixture.root, 'skills', 'demo', 'scripts', 'ok.mjs');
  const result = run(fixture, [script, '--flag']);
  assert.equal(result.status, 0, result.stderr);
  const seen = JSON.parse(result.stdout);
  assert.equal(seen.host, 'codex');
  assert.equal(seen.entry, script);
  assert.deepEqual(seen.args, ['--flag']);
});

test('runs an absolute path that reaches the root through a symlink', () => {
  const fixture = stubRoot();
  const alias = path.join(fixture.base, 'alias');
  fs.symlinkSync(fixture.root, alias);
  const result = run(fixture, [path.join(alias, 'skills', 'demo', 'scripts', 'ok.mjs')]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).entry, path.join(fixture.root, 'skills', 'demo', 'scripts', 'ok.mjs'));
});

test('refuses an absolute path to any other file in the root', () => {
  const fixture = stubRoot();
  assertRefused(fixture, [path.join(fixture.root, 'hooks', 'other.mjs')]);
  assertRefused(fixture, [path.join(fixture.root, 'harnesses', 'codex', 'run.mjs')]);
  assertRefused(fixture, [path.join(fixture.root, 'skills', 'demo', 'scripts', 'data.json')]);
  assertRefused(fixture, [path.join(fixture.root, 'skills', 'demo', 'scripts', 'missing.mjs')]);
});

test('refuses a symlink that escapes the root', () => {
  const fixture = stubRoot();
  fs.symlinkSync(path.join(fixture.base, 'outside.mjs'), path.join(fixture.root, 'skills', 'demo', 'scripts', 'evil.mjs'));
  assertRefused(fixture, ['skills/demo/scripts/evil.mjs']);
});

test('refuses a symlinked folder that escapes the root', () => {
  const fixture = stubRoot();
  fs.mkdirSync(path.join(fixture.base, 'scripts'));
  fs.copyFileSync(path.join(fixture.base, 'outside.mjs'), path.join(fixture.base, 'scripts', 'ok.mjs'));
  fs.mkdirSync(path.join(fixture.root, 'skills', 'evil'));
  fs.symlinkSync(path.join(fixture.base, 'scripts'), path.join(fixture.root, 'skills', 'evil', 'scripts'));
  assertRefused(fixture, ['skills/evil/scripts/ok.mjs']);
});

test('refuses an absolute path through a symlink that escapes the root', () => {
  const fixture = stubRoot();
  const evil = path.join(fixture.root, 'skills', 'demo', 'scripts', 'evil.mjs');
  fs.symlinkSync(path.join(fixture.base, 'outside.mjs'), evil);
  assertRefused(fixture, [evil]);
});

test('refuses a symlink that stays in the root but leaves the skill scripts', () => {
  const fixture = stubRoot();
  fs.symlinkSync(path.join(fixture.root, 'hooks', 'other.mjs'), path.join(fixture.root, 'skills', 'demo', 'scripts', 'link.mjs'));
  assertRefused(fixture, ['skills/demo/scripts/link.mjs']);
});

test('refuses any other file', () => {
  const fixture = stubRoot();
  assertRefused(fixture, ['hooks/other.mjs']);
  assertRefused(fixture, ['harnesses/codex/run.mjs']);
  assertRefused(fixture, ['skills/demo/scripts/data.json']);
  assertRefused(fixture, ['skills/demo/ok.mjs']);
  assertRefused(fixture, ['skills/demo/scripts/sub/ok.mjs']);
  assertRefused(fixture, ['skills/demo/scripts/missing.mjs']);
  assertRefused(fixture, ['skills/demo/scripts']);
  assertRefused(fixture, ['skills\\demo\\scripts\\ok.mjs']);
  assertRefused(fixture, []);
});
