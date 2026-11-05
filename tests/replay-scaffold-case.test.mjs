import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { boundedDiff, changelogSymptom, isInputFile, MAX_DIFF_CHARS } from '../benchmarks/replay/scaffold-case.mjs';
import { git, tempDir } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../benchmarks/replay/scaffold-case.mjs', import.meta.url));

function fixRepository() {
  const root = tempDir('scaffold-case-');
  git(root, 'init', '-q');
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'src/a.mjs'), 'export const limit = 1;\n');
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'seed');
  fs.writeFileSync(path.join(root, 'src/a.mjs'), 'export const limit = 3;\n');
  fs.writeFileSync(path.join(root, 'src/new.mjs'), 'export {};\n');
  fs.writeFileSync(path.join(root, 'tests/a.test.mjs'), 'test\n');
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n- `src/a.mjs` counted 1 where 3 were asked.\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fix(a): count three');
  return root;
}

function scaffold(root, cases, ...extra) {
  return execFileSync('node', [SCRIPT, '--repo', root, '--cases-dir', cases, '--commit', 'HEAD', '--id', 'real-a', ...extra], { encoding: 'utf8' });
}

test('a fix commit becomes a case with parent input, provenance and the symptom from the changelog line', () => {
  const root = fixRepository();
  const cases = tempDir('scaffold-cases-');
  scaffold(root, cases);
  const folder = path.join(cases, 'real-a');
  const definition = JSON.parse(fs.readFileSync(path.join(folder, 'case.json'), 'utf8'));
  const head = git(root, 'rev-parse', 'HEAD');
  assert.equal(definition.provenance.type, 'fix-commit');
  assert.equal(definition.provenance.ref, head);
  assert.equal(definition.provenance.parent, git(root, 'rev-parse', 'HEAD^'));
  assert.equal(definition.provenance.subject, 'fix(a): count three');
  assert.equal(definition.kind, 'case');
  assert.equal(definition.constructed, true);
  assert.equal(definition.grade.type, 'rubric');
  assert.match(definition.grade.rubric, /\+export const limit = 3;/);
  assert.match(fs.readFileSync(path.join(folder, 'prompt.md'), 'utf8'), /Symptom: `src\/a\.mjs` counted 1 where 3 were asked\./);
  assert.equal(fs.readFileSync(path.join(folder, 'input/src/a.mjs'), 'utf8'), 'export const limit = 1;\n');
  assert.deepEqual(fs.readdirSync(path.join(folder, 'input/src')), ['a.mjs']);
  assert.equal(fs.existsSync(path.join(folder, 'input/tests')), false);
});

test('a dry run writes nothing and an existing case is refused without --force', () => {
  const root = fixRepository();
  const cases = tempDir('scaffold-cases-');
  assert.match(scaffold(root, cases, '--dry-run'), /^would write .*real-a \(1 input files: src\/a\.mjs/);
  assert.equal(fs.existsSync(path.join(cases, 'real-a')), false);
  scaffold(root, cases);
  assert.throws(() => scaffold(root, cases), (error) => error.status === 2 && /pass --force/.test(error.stderr));
  scaffold(root, cases, '--force');
});

test('a commit with no changelog line and no --symptom leaves the case unready', () => {
  const root = fixRepository();
  git(root, 'commit', '-q', '--allow-empty', '-m', 'noop');
  fs.writeFileSync(path.join(root, 'src/a.mjs'), 'export const limit = 4;\n');
  git(root, 'commit', '-q', '-am', 'fix(a): four');
  const cases = tempDir('scaffold-cases-');
  scaffold(root, cases);
  const definition = JSON.parse(fs.readFileSync(path.join(cases, 'real-a/case.json'), 'utf8'));
  assert.equal(definition.ready, false);
  assert.equal(definition.not_ready_reason, 'no symptom given');
});

test('helpers drop tests and docs, read the first added changelog line and bound the diff', () => {
  assert.equal(isInputFile('src/a.mjs'), true);
  assert.equal(isInputFile('tests/a.test.mjs'), false);
  assert.equal(isInputFile('docs/a.md'), false);
  assert.equal(changelogSymptom('+++ b/CHANGELOG.md\n+- first\n+- second\n'), 'first');
  assert.equal(changelogSymptom('no lines'), null);
  assert.match(boundedDiff('x'.repeat(MAX_DIFF_CHARS + 5)), /\[diff cut at \d+ characters\]$/);
});
