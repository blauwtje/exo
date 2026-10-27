import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { codeRuleFindings } from '../lib/code-rules.mjs';

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
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'code-rules-')));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '--quiet', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(root, 'keep.txt'), 'keep\n');
  git('add', 'keep.txt');
  git('commit', '--quiet', '-m', 'base');
  return root;
}

function findings(source, name = 'sample.mjs') {
  const root = repository();
  try {
    fs.writeFileSync(path.join(root, name), source);
    return codeRuleFindings({ root, base: 'HEAD', paths: [name] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
  try {
    const file = path.join(root, 'sample.mjs');
    fs.writeFileSync(file, 'try {\n  run();\n} catch {\n}\n');
    execFileSync('git', ['-C', root, 'add', 'sample.mjs']);
    execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'old']);
    fs.appendFileSync(file, 'const other = 1;\n');
    const { fails } = codeRuleFindings({ root, base: 'HEAD', paths: ['sample.mjs'] });
    assert.deepEqual(fails, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the eslint path asks for no-empty and no-unused-vars and fails on both', () => {
  const root = repository();
  try {
    const bin = path.join(root, 'node_modules', '.bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'eslint'), FAKE_ESLINT, { mode: 0o755 });
    fs.writeFileSync(path.join(root, 'sample.mjs'), 'const unused = 1;\n');
    const { fails } = codeRuleFindings({ root, base: 'HEAD', paths: ['sample.mjs'] });
    assert.deepEqual(fails, ['sample.mjs:1 no-empty reported', 'sample.mjs:1 no-unused-vars reported']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
  try {
    const app = path.join(root, 'packages', 'app');
    fs.mkdirSync(path.join(app, 'src'), { recursive: true });
    fs.writeFileSync(path.join(app, 'eslint.config.js'), 'export default [];\n');
    installEslint(root);
    installEslint(app);
    fs.writeFileSync(path.join(app, 'src', 'a.mjs'), 'const a = 1;\n');
    fs.writeFileSync(path.join(root, 'b.mjs'), 'const b = 1;\n');
    const { fails } = codeRuleFindings({ root, base: 'HEAD', paths: ['packages/app/src/a.mjs', 'b.mjs'] });
    assert.deepEqual(fails.sort(), [`b.mjs:1 no-empty ${root} true`, `packages/app/src/a.mjs:1 no-empty ${app} false`]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a config folder without its own eslint binary uses the root binary from that folder', () => {
  const root = repository();
  try {
    const app = path.join(root, 'app');
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, '.eslintrc.json'), '{}\n');
    installEslint(root);
    fs.writeFileSync(path.join(app, 'a.mjs'), 'const a = 1;\n');
    const { fails } = codeRuleFindings({ root, base: 'HEAD', paths: ['app/a.mjs'] });
    assert.deepEqual(fails, [`app/a.mjs:1 no-empty ${app} false`]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
