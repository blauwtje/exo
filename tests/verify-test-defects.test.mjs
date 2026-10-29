import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { weakenedTests } from '../skills/gate/scripts/gate.mjs';
import { mergeReviews } from '../skills/gate/scripts/merge-reviews.mjs';
import { git } from './harness.mjs';
import { landingCheckout } from './land-task-fixture.mjs';

const VERIFY = fileURLToPath(new URL('../skills/gate/scripts/gate.mjs', import.meta.url));

async function write(root, file, text) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), text);
}

async function weakenedBranch() {
  const { root, planPath } = await landingCheckout();
  await write(root, 'tests/gone.test.js', 'assert.ok(true);\n');
  await write(root, 'tests/app.test.js', 'test("a", () => {\n  assert.equal(greet(), "hello");\n});\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'test: seed');
  git(root, 'switch', '-q', '-c', 'feat/fixture');
  await write(root, 'src/app.js', 'export function greet() {\n  return "hello"; // eslint-disable-line\n}\n');
  await write(root, 'tests/app.test.js', 'test.skip("a", () => {\n});\n');
  git(root, 'rm', '-q', 'tests/gone.test.js');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): greet', '-m', 'Plan-task: fixture/1');
  await write(root, '.exo/proof-fixture-task-1.txt', 'pass\n');
  return { root, planPath };
}

function verify(root, planPath) {
  const output = spawnSync('node', [VERIFY, '--plan', planPath, '--root', root, '--base', 'main'], { encoding: 'utf8' }).stdout;
  return output.split('\n');
}

test('a deleted test file, a removed assertion, an added skip and a silencer become defect report lines', async () => {
  const { root, planPath } = await weakenedBranch();
  const lines = verify(root, planPath);
  const report = path.join(root, '.exo', 'code-rules.md');
  assert.ok(lines.includes(`CODE-RULES ${report}`), lines.join('\n'));
  const text = await fs.readFile(report, 'utf8');
  assert.match(text, /^tests\/gone\.test\.js:1; defect; deleted test file; .*; report$/m);
  assert.match(text, /^tests\/app\.test\.js:2; defect; removed assertion; .*assert\.equal.*; report$/m);
  assert.match(text, /^tests\/app\.test\.js:1; defect; added skip; .*test\.skip.*; report$/m);
  assert.match(text, /^src\/app\.js:2; defect; silenced check; .*eslint-disable.*; report$/m);
  assert.equal(text.split('\n').filter((line) => /^(tests\/|src\/app\.js:2; defect)/.test(line) && /fix$/.test(line)).length, 0);
});

test('a skipped test in a path with a space still becomes a defect report line', async () => {
  const { root, planPath } = await landingCheckout();
  await write(root, 'tests/my app.test.js', 'test("a", () => {\n  assert.equal(1, 1);\n});\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'test: seed');
  git(root, 'switch', '-q', '-c', 'feat/spaced');
  await write(root, 'src/app.js', 'export function greet() {\n  return "hello";\n}\n');
  await write(root, 'tests/my app.test.js', 'test.skip("a", () => {\n});\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): greet', '-m', 'Plan-task: fixture/1');
  await write(root, '.exo/proof-fixture-task-1.txt', 'pass\n');
  const run = spawnSync('node', [VERIFY, '--plan', planPath, '--root', root, '--base', 'main'], { encoding: 'utf8' });
  assert.doesNotMatch(run.stderr, /TypeError/, run.stderr);
  const text = await fs.readFile(path.join(root, '.exo', 'code-rules.md'), 'utf8');
  assert.match(text, /^tests\/my app\.test\.js:1; defect; added skip; .*test\.skip.*; report$/m);
});

test('verify prints no WARN claims-diff line for those findings', async () => {
  const { root, planPath } = await weakenedBranch();
  const lines = verify(root, planPath);
  assert.deepEqual(lines.filter((line) => line.includes('claims-diff') && line.startsWith('WARN')), []);
});

test('mergeReviews lists each of those lines as a report finding', async () => {
  const { root, planPath } = await weakenedBranch();
  verify(root, planPath);
  const text = await fs.readFile(path.join(root, '.exo', 'code-rules.md'), 'utf8');
  const merged = mergeReviews([{ name: 'code-rules', text }]);
  assert.equal(merged.shown.filter((line) => line.includes('; defect; ')).length, 4);
  assert.equal(merged.shown.filter((line) => line.includes('tests/gone.test.js')).length, 1);
});

function patchOf(file, removed, added) {
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -4,${removed.length} +4,${added.length} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ''
  ].join('\n');
}

test('an assertion rewritten in place is not reported as removed', () => {
  const patch = patchOf('tests/hooks.test.mjs', [
    "  assert.deepEqual(Object.keys(HOOKS).sort(), ['PreToolUse', 'SessionStart', 'Stop']);",
    '  assert.equal(entries.length, 8);'
  ], [
    "  assert.deepEqual(Object.keys(HOOKS).sort(), ['PreToolUse', 'SessionEnd', 'SessionStart', 'Stop']);",
    '  assert.equal(entries.length, 9);'
  ]);
  assert.deepEqual(weakenedTests(patch), []);
});

test('an assertion removed with no assertion added beside it is still reported', () => {
  const patch = patchOf('tests/hooks.test.mjs', ['  assert.equal(entries.length, 8);'], ['  const count = entries.length;']);
  assert.deepEqual(weakenedTests(patch), ['tests/hooks.test.mjs:4 removed `assert.equal(entries.length, 8);`']);
});

test('two assertions replaced by one still report the unreplaced one', () => {
  const patch = patchOf('tests/hooks.test.mjs', ['  assert.equal(a, 1);', '  assert.equal(b, 2);'], ['  assert.equal(a, 3);']);
  assert.deepEqual(weakenedTests(patch), ['tests/hooks.test.mjs:5 removed `assert.equal(b, 2);`']);
});

test('an assertion added in an earlier hunk does not cover a removal in a later hunk', () => {
  const patch = [
    '--- a/tests/a.test.mjs',
    '+++ b/tests/a.test.mjs',
    '@@ -2,0 +3,1 @@',
    '+  assert.ok(extra);',
    '@@ -10,1 +11,0 @@',
    '-  assert.equal(entries.length, 8);',
    ''
  ].join('\n');
  assert.deepEqual(weakenedTests(patch), ['tests/a.test.mjs:10 removed `assert.equal(entries.length, 8);`']);
});
