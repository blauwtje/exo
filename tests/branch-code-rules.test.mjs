import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { codeRuleConcerns, codeRuleFindings } from '../lib/code-rules.mjs';
import { codeRulesReport } from '../skills/gate/scripts/code-rule-lines.mjs';
import { git, tempDir } from './harness.mjs';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'review-skip-defects');
const MODULE = 'src/parse-config.mjs';
const FIXTURE_FILES = [MODULE, 'tests/parse-config.test.mjs'];

function branchWith(files, manifest = { type: 'module' }) {
  const root = fs.realpathSync(tempDir('branch-code-rules-'));
  git(root, 'init', '--quiet', '-b', 'main');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'base');
  git(root, 'checkout', '--quiet', '-b', 'feature');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'add');
  return { root, base: 'main', paths: Object.keys(files) };
}

function fixtureBranch() {
  return branchWith(Object.fromEntries(FIXTURE_FILES.map((name) => [name, fs.readFileSync(path.join(FIXTURE, name), 'utf8')])));
}

function rulesAt(findings) {
  return findings.map((finding) => finding.split(' ').slice(0, 2).join(' '));
}

test('the scan flags the duplicate literal and the unused export planted in the fixture', () => {
  assert.deepEqual(rulesAt(codeRuleConcerns(fixtureBranch())), [`${MODULE}:3 duplicate-literal`, `${MODULE}:21 unused-export`]);
});

test('the scan flags the swallowed catch planted in the fixture', () => {
  const { fails } = codeRuleFindings(fixtureBranch());
  assert.deepEqual(rulesAt(fails), [`${MODULE}:14 swallowed-catch`]);
});

test('the report lists a concern as a report finding', () => {
  const report = codeRulesReport([], '/unused', { concerns: [`${MODULE}:3 duplicate-literal text`] });
  assert.match(report, new RegExp(`^${MODULE}:3 duplicate-literal text concern report$`, 'm'));
});

test('an export another file imports is not flagged', () => {
  const branch = branchWith({ 'src/a.mjs': 'export function used() {\n  return 1;\n}\n', 'src/b.mjs': "import { used } from './a.mjs';\nexport default used;\n" });
  assert.deepEqual(codeRuleConcerns({ ...branch, paths: ['src/a.mjs'] }), []);
});

test('an export listed under a name another file imports is not flagged', () => {
  const branch = branchWith({ 'src/a.mjs': 'const value = 1;\nexport { value as shared };\n', 'src/b.mjs': "import { shared } from './a.mjs';\nconsole.log(shared);\n" });
  assert.deepEqual(codeRuleConcerns({ ...branch, paths: ['src/a.mjs'] }), []);
});

test('an export of the package entry file is not flagged', () => {
  const branch = branchWith({ 'src/main.mjs': 'export function api() {\n  return 1;\n}\n' }, { type: 'module', main: './src/main.mjs' });
  assert.deepEqual(codeRuleConcerns(branch), []);
});

test('an unused export in a test file is not flagged', () => {
  const branch = branchWith({ 'tests/helper.test.mjs': 'export function helper() {\n  return 1;\n}\n' });
  assert.deepEqual(codeRuleConcerns(branch), []);
});

test('a literal bound once is not flagged', () => {
  const branch = branchWith({ 'src/a.mjs': "const port = 8080;\nconst host = 'localhost';\nconsole.log(port, host);\n" });
  assert.deepEqual(codeRuleConcerns(branch), []);
});

test('a literal compared twice or a short literal bound twice is not flagged', () => {
  const branch = branchWith({ 'src/a.mjs': "const one = 10;\nconst two = 10;\nconsole.log(one === 8080, two === 8080);\nconsole.log(one === 'localhost', two === 'localhost');\n" });
  assert.deepEqual(codeRuleConcerns(branch), []);
});

test('a literal bound twice only in a test file is not flagged', () => {
  const branch = branchWith({ 'tests/a.test.mjs': 'const first = 8080;\nconst second = 8080;\nconsole.log(first, second);\n' });
  assert.deepEqual(codeRuleConcerns(branch), []);
});
