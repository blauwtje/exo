import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { git, tempDir } from './harness.mjs';
import { codeRuleConcerns, codeRuleFindings } from '../lib/code-rules.mjs';

const FAKE_ESLINT = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('9.0.0');
  process.exit(0);
}
const names = args.flatMap((arg, index) => (args[index - 1] === '--rule' ? [arg.split(':')[0]] : []));
const files = args.slice(args.indexOf('--') + 1);
const messages = ['no-empty', 'no-unused-vars']
  .filter((name) => names.includes(name))
  .map((ruleId) => ({ ruleId, line: 1, message: 'reported' }));
console.log(JSON.stringify(files.map((file) => ({ filePath: require('node:path').resolve(file), messages }))));
`;

function repository() {
  const root = fs.realpathSync(tempDir('code-rules-'));
  git(root, 'init', '--quiet', '-b', 'main');
  fs.writeFileSync(path.join(root, 'keep.txt'), 'keep\n');
  git(root, 'add', 'keep.txt');
  git(root, 'commit', '--quiet', '-m', 'base');
  return root;
}

function findings(source, name = 'sample.mjs') {
  const root = repository();
  fs.writeFileSync(path.join(root, name), source);
  return codeRuleFindings({ root, base: 'HEAD', paths: [name] });
}

function swallowed(source) {
  return findings(source).fails.filter((fail) => fail.includes('swallowed-catch'));
}

test('an empty catch block fails on the catch line', () => {
  assert.deepEqual(swallowed('try {\n  run();\n} catch (error) {\n}\n'), [
    'sample.mjs:3 swallowed-catch catch block swallows the error: rethrow it or handle it',
  ]);
});

test('a catch block with only a comment fails', () => {
  assert.equal(swallowed('try {\n  run();\n} catch {\n  // ignore\n}\n').length, 1);
});

test('a catch block that only logs fails, however many log calls it holds', () => {
  assert.equal(swallowed('try {\n  run();\n} catch (error) {\n  console.error(error);\n  logger.warn(\n    "failed",\n  );\n}\n').length, 1);
});

test('a catch block that rethrows, returns or handles passes', () => {
  const source = [
    'try { run(); } catch (error) { throw error; }',
    'try { run(); } catch (error) { console.error(error); process.exitCode = 1; }',
    'try { run(); } catch (error) { return fallback(error); }',
    '',
  ].join('\n');
  assert.deepEqual(swallowed(source), []);
});

test('a catch word inside a string literal passes', () => {
  assert.deepEqual(swallowed('const text = "catch (error) {}";\n'), []);
});

test('an unchanged swallowed catch is not reported when only other lines are added', () => {
  const root = repository();
  const file = path.join(root, 'sample.mjs');
  fs.writeFileSync(file, 'try {\n  run();\n} catch {\n}\n');
  git(root, 'add', 'sample.mjs');
  git(root, 'commit', '--quiet', '-m', 'old');
  fs.appendFileSync(file, 'const other = 1;\n');
  const { fails } = codeRuleFindings({ root, base: 'HEAD', paths: ['sample.mjs'] });
  assert.deepEqual(fails, []);
});

test('the eslint path asks for no-empty and no-unused-vars and fails on both', () => {
  const root = repository();
  const bin = path.join(root, 'node_modules', '.bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'eslint'), FAKE_ESLINT, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'sample.mjs'), 'const unused = 1;\n');
  const { fails } = codeRuleFindings({ root, base: 'HEAD', paths: ['sample.mjs'] });
  assert.deepEqual(fails, ['sample.mjs:1 no-empty reported', 'sample.mjs:1 no-unused-vars reported']);
});

const CWD_ESLINT = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('9.0.0');
  process.exit(0);
}
const files = args.slice(args.indexOf('--') + 1);
const message = process.cwd() + ' ' + args.includes('--no-config-lookup');
console.log(JSON.stringify(files.map((file) => ({ filePath: require('node:path').resolve(file), messages: [{ ruleId: 'no-empty', line: 1, message }] }))));
`;

function installEslint(folder) {
  const bin = path.join(folder, 'node_modules', '.bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'eslint'), CWD_ESLINT, { mode: 0o755 });
}

test('eslint runs from the nearest folder holding a config, with that folder binary', () => {
  const root = repository();
  const app = path.join(root, 'packages', 'app');
  fs.mkdirSync(path.join(app, 'src'), { recursive: true });
  fs.writeFileSync(path.join(app, 'eslint.config.js'), 'export default [];\n');
  installEslint(root);
  installEslint(app);
  fs.writeFileSync(path.join(app, 'src', 'a.mjs'), 'const a = 1;\n');
  fs.writeFileSync(path.join(root, 'b.mjs'), 'const b = 1;\n');
  const { fails } = codeRuleFindings({ root, base: 'HEAD', paths: ['packages/app/src/a.mjs', 'b.mjs'] });
  assert.deepEqual(fails.sort(), [`b.mjs:1 no-empty ${root} true`, `packages/app/src/a.mjs:1 no-empty ${app} false`]);
});

test('a config folder without its own eslint binary uses the root binary from that folder', () => {
  const root = repository();
  const app = path.join(root, 'app');
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, '.eslintrc.json'), '{}\n');
  installEslint(root);
  fs.writeFileSync(path.join(app, 'a.mjs'), 'const a = 1;\n');
  const { fails } = codeRuleFindings({ root, base: 'HEAD', paths: ['app/a.mjs'] });
  assert.deepEqual(fails, [`app/a.mjs:1 no-empty ${app} false`]);
});

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
  const found = codeRuleConcerns(fixtureBranch()).map((concern) => concern.split('; ').slice(0, 3).join('; '));
  assert.deepEqual(found, [`${MODULE}:3; concern; duplicate-literal`, `${MODULE}:21; concern; unused-export`]);
});

test('the scan flags the swallowed catch planted in the fixture', () => {
  const { fails } = codeRuleFindings(fixtureBranch());
  assert.deepEqual(rulesAt(fails), [`${MODULE}:14 swallowed-catch`]);
});

test('a concern has the review finding shape: location, severity, id, one action', () => {
  const concerns = codeRuleConcerns(fixtureBranch());
  assert.equal(concerns.length, 2);
  for (const concern of concerns) assert.match(concern, /^\S+:\d+; concern; [\w-]+; [^;]+; report$/);
  assert.deepEqual(concerns.map((concern) => concern.split('; ')[2]), ['duplicate-literal', 'unused-export']);
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
