import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkScriptOptions, optionNames } from '../verify/checks/script-options.mjs';
import { createRepository } from '../verify/repository.mjs';
import { GIT_IDENTITY } from './harness.mjs';
import { recorder, tree } from './check-outcome.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { env: { ...process.env, ...GIT_IDENTITY }, stdio: 'pipe' });

function repositoryAt(files, { remote = true } = {}) {
  const root = tree(files);
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  if (remote) git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return root;
}

function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function run(root) {
  const report = recorder();
  checkScriptOptions(report, createRepository(root));
  return report.results[0];
}

const SPEC = (names) => `parseFlags(argv, { ${names.map((name) => `${name}: 'value'`).join(', ')} });\n`;

test('an old script with one more option fails and names the file and the option', () => {
  const root = repositoryAt({ 'lib/tool.mjs': SPEC(['plan']) });
  write(root, 'lib/tool.mjs', SPEC(['plan', 'extra']));
  const outcome = run(root);
  assert.equal(outcome.status, 'FAIL');
  assert.match(outcome.detail, /lib\/tool\.mjs/);
  assert.match(outcome.detail, /--extra/);
});

test('an unchanged script passes', () => {
  const root = repositoryAt({ 'lib/tool.mjs': SPEC(['plan']) });
  assert.equal(run(root).status, 'PASS');
});

test('a new script with 6 options fails and with 5 passes', () => {
  const root = repositoryAt({ 'README.md': 'x\n' });
  write(root, 'lib/five.mjs', SPEC(['a', 'b', 'c', 'd', 'e']));
  assert.equal(run(root).status, 'PASS');
  write(root, 'lib/six.mjs', SPEC(['a', 'b', 'c', 'd', 'e', 'f']));
  const outcome = run(root);
  assert.equal(outcome.status, 'FAIL');
  assert.match(outcome.detail, /lib\/six\.mjs/);
  assert.doesNotMatch(outcome.detail, /five/);
});

test('a parseArgs call split over lines counts its options', () => {
  const split = (names) => `const { values } = parseArgs({\n  allowPositionals: true,\n  options:\n  {\n${names.map((name) => `    ${name}: { type: 'string' },\n`).join('')}  }\n});\n`;
  const root = repositoryAt({ 'tool.mjs': split(['cwd']) });
  write(root, 'tool.mjs', split(['cwd', 'more']));
  const outcome = run(root);
  assert.equal(outcome.status, 'FAIL');
  assert.match(outcome.detail, /--more/);
});

test('a spawn argument list adds nothing', () => {
  const root = repositoryAt({ 'tool.mjs': "spawnSync('git', ['log']);\n" });
  write(root, 'tool.mjs', "spawnSync('git', ['log', '--no-merges', '--oneline']);\nrun(['--extra', 'x']);\n");
  assert.equal(run(root).status, 'PASS');
});

test('a compared quoted literal counts as an option, help does not', () => {
  assert.deepEqual(
    optionNames("if (argv[0] === '--routes') x; switch (a) { case '--merge': break; } argv.includes('--help'); argv.indexOf('--zed'); argv.startsWith('--no');"),
    ['merge', 'routes', 'zed']
  );
});

test('optionNames reads FLAGS and parseFlags specs, sorted and unique', () => {
  assert.deepEqual(optionNames("const FLAGS = { 'repository-root': 'value', b: 'boolean' };\nparseFlags(argv, { b: 'boolean', a: 'value' });"), ['a', 'b', 'repository-root']);
});

test('a missing origin/main is UNRUN', () => {
  const root = repositoryAt({ 'tool.mjs': SPEC(['plan']) }, { remote: false });
  assert.equal(run(root).status, 'UNRUN');
});
