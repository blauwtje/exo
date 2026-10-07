// The sibling scan hook adds a note of at most 5 lines after an Edit that
// removes lines, only with the `sibling_scan` setting on. The visible fix of
// the test-pollution seed is replayed on a copy of that seed.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../hooks/sibling-scan.mjs', import.meta.url));
const SEED = fileURLToPath(new URL('../benchmarks/value/test-pollution/seed/', import.meta.url));
const REMOVED = '  return Object.assign(DEFAULTS, overrides);';
const FIXED = '  return { ...DEFAULTS, ...overrides };';

let work;
let repo;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// A fresh git repository of `files` (path to text) under the work folder.
function makeRepo(name, files) {
  const dir = path.join(work, name);
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  git(work, 'init', '-q', dir);
  git(dir, 'add', '-A');
  return dir;
}

before(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-sibling-scan-'));
  repo = path.join(work, 'seed');
  fs.cpSync(SEED, repo, { recursive: true });
  git(work, 'init', '-q', repo);
  git(repo, 'add', '-A');
});

after(() => fs.rmSync(work, { recursive: true, force: true }));

// The hook's stdout for `input`, with the setting at `setting`.
function scan(input, setting = 'on') {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: work, CLAUDE_PROJECT_DIR: work, CLAUDE_PLUGIN_OPTION_SIBLING_SCAN: setting };
  const run = spawnSync(process.execPath, [HOOK], { env, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

// The hook input of an Edit, after applying it to the file on disk as the tool would.
function edit(dir, file, before, after) {
  const target = path.join(dir, file);
  const text = fs.readFileSync(target, 'utf8');
  if (text.includes(before)) fs.writeFileSync(target, text.replace(before, after));
  return { tool_name: 'Edit', tool_input: { file_path: target, old_string: before, new_string: after }, cwd: dir };
}
const note = (stdout) => JSON.parse(stdout).hookSpecificOutput;

test('the visible test-pollution fix names both sibling modules in a note of at most 5 lines', () => {
  const output = note(scan(edit(repo, 'src/config/options.mjs', REMOVED, FIXED)));
  assert.equal(output.hookEventName, 'PostToolUse');
  const lines = output.additionalContext.split('\n');
  assert.ok(lines.length <= 5, output.additionalContext);
  assert.match(output.additionalContext, /src\/catalog\/price-list\.mjs \(overrides\)/);
  assert.match(output.additionalContext, /src\/pricing\/rounding\.mjs \(activeMode\)/);
  assert.match(output.additionalContext, /module-level DEFAULTS/);
});

test('the scan is silent with the setting off, and off is the default', () => {
  const input = { tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'src/config/options.mjs'), old_string: REMOVED, new_string: FIXED }, cwd: repo };
  assert.equal(scan(input, 'off'), '');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: work, CLAUDE_PROJECT_DIR: work };
  delete env.CLAUDE_PLUGIN_OPTION_SIBLING_SCAN;
  const run = spawnSync(process.execPath, [HOOK], { env, input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
});

test('a removed line held verbatim by another tracked file is named, with no binding sentence outside JavaScript', () => {
  const dir = makeRepo('verbatim', {
    'a.txt': 'keep\nset the retry budget to forty two seconds\n',
    'b.txt': 'before\nset the retry budget to forty two seconds\n',
    'c.txt': 'unrelated\n'
  });
  const text = 'set the retry budget to forty two seconds';
  const output = note(scan(edit(dir, 'a.txt', `keep\n${text}\n`, 'keep\n'))).additionalContext;
  assert.match(output, /Still holding a removed line verbatim: b\.txt\./);
  assert.doesNotMatch(output, /module-level/);
  assert.ok(!output.includes('c.txt'));
});

test('a removed line with shell metacharacters reaches git as data, never a shell', () => {
  const hostile = 'echo "$(touch PWNED1)" `touch PWNED2` ; touch PWNED3 # \'quoted\' --not-an-option';
  const dir = makeRepo('hostile', { 'a.sh': `${hostile}\n`, 'b.sh': `run\n${hostile}\n` });
  const output = note(scan(edit(dir, 'a.sh', `${hostile}\n`, ''))).additionalContext;
  assert.match(output, /Still holding a removed line verbatim: b\.sh\./);
  for (const name of ['PWNED1', 'PWNED2', 'PWNED3']) {
    assert.ok(!fs.existsSync(path.join(dir, name)) && !fs.existsSync(path.join(process.cwd(), name)), name);
  }
  const dash = '--exec=touch PWNED4 and more text';
  const dashDir = makeRepo('dash', { 'a.txt': `${dash}\n`, 'b.txt': `${dash}\n` });
  assert.match(note(scan(edit(dashDir, 'a.txt', `${dash}\n`, ''))).additionalContext, /b\.txt/);
  assert.ok(!fs.existsSync(path.join(dashDir, 'PWNED4')));
});

test('the scan source runs git only through an argument array', () => {
  const source = fs.readFileSync(HOOK, 'utf8');
  assert.ok(!/(?<![.\w])exec(?:Sync)?\(|shell\s*:|\bspawn(?:Sync)?\(/.test(source));
  assert.match(source, /execFileSync\('git', args/);
});

test('an edit that removes nothing, a trivial line, or a replacement kept elsewhere stays silent', () => {
  const dir = makeRepo('quiet', { 'a.mjs': 'export const x = 1;\nreturn x;\n', 'b.mjs': 'return x;\n' });
  assert.equal(scan(edit(dir, 'a.mjs', 'export const x = 1;', 'export const x = 1;\nexport const y = 2;')), '');
  assert.equal(scan(edit(dir, 'a.mjs', 'return x;', '')), '');
  assert.equal(scan(edit(dir, 'a.mjs', 'export const x = 1;', 'export const x = 1;')), '');
});

test('a removed mutation of a module-level binding lists other shared bindings, none when nothing else is shared', () => {
  const dir = makeRepo('bindings', {
    'a.mjs': 'const cache = new Map();\nexport function put(key) {\n  cache.set(key, 1);\n  return key;\n}\n',
    'b.mjs': 'let mode = "x";\nexport function use(next) {\n  mode = next;\n}\nexport const pure = 1;\n',
    'c.mjs': 'export function f(list) {\n  const local = [];\n  local.push(list);\n  return local;\n}\n'
  });
  const output = note(scan(edit(dir, 'a.mjs', '  cache.set(key, 1);\n', '  return key;\n'))).additionalContext;
  assert.match(output, /module-level cache\. Other module-level bindings that functions mutate: b\.mjs \(mode\)\./);
  assert.ok(!output.includes('c.mjs'));
  const solo = makeRepo('solo', { 'a.mjs': 'const cache = new Map();\nexport function put(key) {\n  cache.set(key, 1);\n}\n' });
  assert.equal(scan(edit(solo, 'a.mjs', '  cache.set(key, 1);\n', '')), '');
});

test('other tools, a missing file, a non-repository and bad input stay silent with exit 0', () => {
  assert.equal(scan({ tool_name: 'Write', tool_input: { file_path: path.join(repo, 'x.mjs'), content: 'x' }, cwd: repo }), '');
  assert.equal(scan({ tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'x.mjs') }, cwd: repo }), '');
  const loose = path.join(work, 'loose');
  fs.mkdirSync(loose);
  fs.writeFileSync(path.join(loose, 'a.mjs'), 'x\n');
  assert.equal(scan(edit(loose, 'a.mjs', 'const removed = new Map();\n', '')), '');
  assert.equal(scan(''), '');
  assert.equal(scan('not json'), '');
});
