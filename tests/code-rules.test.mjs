import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codeRuleFindings } from '#code-rules';

const DEEP = [
  'function deep(items) {',
  '  if (items) {',
  '    for (const item of items) {',
  '      if (item) {',
  '        use(item);',
  '      }',
  '    }',
  '  }',
  '}',
  '',
].join('\n');

const git = (root, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, stdio: 'ignore' });

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'code-rules-'));
  git(root, 'init', '-q');
  writeFileSync(join(root, 'seed.txt'), 'seed\n');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

function stubEslint(root, body) {
  const dir = join(root, 'node_modules', '.bin');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'eslint');
  writeFileSync(file, `#!/usr/bin/env node\nif (process.argv.includes('--version')) { console.log('v9.0.0'); process.exit(0); }\n${body}\n`);
  chmodSync(file, 0o755);
}

const findings = (root, paths) => codeRuleFindings({ root, base: 'HEAD', paths });

test('the simple check fails nesting over 2, many parameters and comments on added lines', () => {
  const root = fixture({});
  writeFileSync(join(root, 'a.js'), `// note\n${DEEP}function many(a, b, c, d) {\n  return a;\n}\n`);
  const { fails, warns } = findings(root, ['a.js']);
  assert.deepEqual(warns, []);
  assert.equal(fails.length, 3);
  assert.match(fails[0], /^a\.js:1 comment \/\/ note$/);
  assert.match(fails[1], /^a\.js:5 max-depth /);
  assert.match(fails[2], /^a\.js:11 max-params /);
  rmSync(root, { recursive: true });
});

test('the simple check warns on a function over 20 lines', () => {
  const root = fixture({});
  const body = Array.from({ length: 21 }, (_, index) => `  step(${index});`).join('\n');
  writeFileSync(join(root, 'a.js'), `function long() {\n${body}\n}\n`);
  const { fails, warns } = findings(root, ['a.js']);
  assert.deepEqual(fails, []);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /^a\.js:1 max-lines-per-function /);
  rmSync(root, { recursive: true });
});

test('a breach on a line the change did not add is not reported', () => {
  const root = fixture({ 'a.js': DEEP });
  writeFileSync(join(root, 'a.js'), `${DEEP}const fine = 1;\n`);
  assert.deepEqual(findings(root, ['a.js']), { fails: [], warns: [] });
  rmSync(root, { recursive: true });
});

test('a line that only gained or lost a comment keeps its comment finding but gets no structure finding', () => {
  const root = fixture({ 'a.js': DEEP });
  writeFileSync(join(root, 'a.js'), DEEP.replace('      if (item) {', '      if (item) { // check'));
  const { fails } = findings(root, ['a.js']);
  assert.equal(fails.length, 1);
  assert.match(fails[0], /^a\.js:4 comment .*\/\/ check$/);
  rmSync(root, { recursive: true });
});

test('a line whose code changed is still judged for structure', () => {
  const root = fixture({ 'a.js': DEEP });
  writeFileSync(join(root, 'a.js'), DEEP.replace('      if (item) {', '      if (item && items) {'));
  const { fails } = findings(root, ['a.js']);
  assert.equal(fails.length, 1);
  assert.match(fails[0], /^a\.js:4 max-depth /);
  rmSync(root, { recursive: true });
});

test('the simple check counts parameters and ignores a destructured object as one', () => {
  const root = fixture({});
  writeFileSync(join(root, 'a.js'), 'const one = ({ a, b, c, d }) => a;\nconst two = (a, b, c) => a;\nconst three = (a, b, c, d) => a;\n');
  const { fails } = findings(root, ['a.js']);
  assert.equal(fails.length, 1);
  assert.match(fails[0], /^a\.js:3 max-params /);
  rmSync(root, { recursive: true });
});

test('the simple check reads Python by indentation', () => {
  const root = fixture({});
  const text = 'def run(items):\n    if items:\n        for item in items:\n            if item:\n                use(item)\n';
  writeFileSync(join(root, 'a.py'), text);
  const { fails } = findings(root, ['a.py']);
  assert.equal(fails.length, 1);
  assert.match(fails[0], /^a\.py:4 max-depth /);
  rmSync(root, { recursive: true });
});

test('a prose or config path is skipped', () => {
  const root = fixture({});
  writeFileSync(join(root, 'notes.md'), '// not code\n');
  assert.deepEqual(findings(root, ['notes.md', 'gone.js']), { fails: [], warns: [] });
  rmSync(root, { recursive: true });
});

test('ESLint messages are kept for the five rules on added lines only', () => {
  const root = fixture({ 'a.js': 'const x = 1;\n' });
  writeFileSync(join(root, 'a.js'), 'const x = 1;\nconst y = 2;\nconst z = 3;\n');
  stubEslint(root, `
const path = ${JSON.stringify(join(root, 'a.js'))};
console.log(JSON.stringify([{ filePath: path, messages: [
  { ruleId: 'max-depth', line: 1, message: 'old depth' },
  { ruleId: 'max-depth', line: 2, message: 'new depth' },
  { ruleId: 'max-lines-per-function', line: 3, message: 'new long' },
  { ruleId: 'semi', line: 3, message: 'style' },
] }]));
process.exit(1);`);
  const { fails, warns } = findings(root, ['a.js']);
  assert.deepEqual(fails, ['a.js:2 max-depth new depth']);
  assert.deepEqual(warns, ['a.js:3 max-lines-per-function new long']);
  rmSync(root, { recursive: true });
});

test('ESLint runs with the rule flags and no config lookup when the project has no config', () => {
  const root = fixture({});
  writeFileSync(join(root, 'a.js'), 'const y = 2;\n');
  stubEslint(root, `
const args = process.argv.slice(2);
const bad = !args.includes('--no-config-lookup') || !args.includes('--format') || args.filter((arg) => arg === '--rule').length !== 5;
console.log(JSON.stringify([{ filePath: ${JSON.stringify(join(root, 'a.js'))}, messages: bad ? [{ ruleId: 'max-depth', line: 1, message: 'bad flags' }] : [] }]));`);
  assert.deepEqual(findings(root, ['a.js']), { fails: [], warns: [] });
  rmSync(root, { recursive: true });
});

test('an ESLint error falls back to the simple check', () => {
  const root = fixture({});
  writeFileSync(join(root, 'a.js'), DEEP);
  stubEslint(root, "console.error('boom'); process.exit(2);");
  const { fails } = findings(root, ['a.js']);
  assert.equal(fails.length, 1);
  assert.match(fails[0], /^a\.js:4 max-depth /);
  rmSync(root, { recursive: true });
});

test('an ESLint parse error on a file falls back to the simple check for that file', () => {
  const root = fixture({});
  writeFileSync(join(root, 'a.js'), DEEP);
  writeFileSync(join(root, 'b.js'), 'const ok = 1;\n');
  stubEslint(root, `
console.log(JSON.stringify([
  { filePath: ${JSON.stringify(join(root, 'a.js'))}, messages: [{ ruleId: null, fatal: true, line: 1, message: 'Parsing error' }] },
  { filePath: ${JSON.stringify(join(root, 'b.js'))}, messages: [{ ruleId: 'no-else-return', line: 1, message: 'else after return' }] },
]));`);
  const { fails } = findings(root, ['a.js', 'b.js']);
  assert.equal(fails.length, 2);
  assert.match(fails[0], /^a\.js:4 max-depth /);
  assert.equal(fails[1], 'b.js:1 no-else-return else after return');
  rmSync(root, { recursive: true });
});
