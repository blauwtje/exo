import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkRunContract } from '../verify/checks/run-contract.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function runOn(repository) {
  const results = [];
  const report = { assert: (ok, ...texts) => results.push({ ok, detail: texts[ok ? 1 : 2] }) };
  checkRunContract(report, repository);
  return results[0];
}

function outcome(files) {
  const root = tempDir('run-contract-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return runOn(createRepository(root));
}

test('the shipped repository passes', () => {
  const result = runOn(createRepository(ROOT));
  assert.equal(result.ok, true, result.detail);
});

test('a script that prints its own stop line fails and names the line', () => {
  const result = outcome({ 'skills/gate/scripts/gate-new.mjs': "const a = 1;\nconsole.log('DECIDE x: end the turn');\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /gate-new\.mjs:2 prints a stop line/);
});

test('a script that runs a check command directly fails', () => {
  const result = outcome({ 'skills/build/scripts/land-new.mjs': "runTreeSync('npm run check', { cwd });\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /land-new\.mjs:1 runs a check outside the check entry/);
});

test('a script that spawns a variable check command or the npm array form fails', () => {
  for (const line of ['spawnSync(proof, { cwd, shell: true });', 'runTreeSync(command, { cwd });', "spawnSync('npm', ['run', 'check']);"]) {
    const result = outcome({ 'skills/build/scripts/land-new.mjs': `${line}\n` });
    assert.equal(result.ok, false, line);
    assert.match(result.detail, /land-new\.mjs:1 runs a check outside the check entry/);
  }
});

for (const [route, line] of [
  ['runTree', 'await runTree(command, { cwd: root });'],
  ['runTreeSync', 'runTreeSync(`node --test ${file}`, { cwd });'],
  ['the pool command', 'runTreeSync(testPoolCommand(files), { cwd });'],
  ['spawnSync', "spawnSync('node', ['--test', file], { cwd });"]
]) {
  test(`a script that runs a test check through ${route} fails`, () => {
    const result = outcome({ 'skills/build/scripts/land-new.mjs': `${line}\n` });
    assert.equal(result.ok, false);
    assert.match(result.detail, /land-new\.mjs:1 runs a check outside the check entry/);
  });
}

test('a git spawn with an argument list passes', () => {
  assert.equal(outcome({ 'skills/build/scripts/ok.mjs': "spawnSync(command, args, { cwd });\n" }).ok, true);
});

test('a clean script passes', () => {
  const result = outcome({
    'skills/build/scripts/ok.mjs': "console.log('LANDED 1');\n"
  });
  assert.equal(result.ok, true);
});

test('the run-loop page fails with its own stop rule or without the table pointer', () => {
  assert.equal(outcome({ 'skills/build/references/run-loop.md': '- A choice stops the run with a question.\n' }).ok, false);
  assert.equal(outcome({ 'skills/build/references/run-loop.md': '- Follow `lib/run-outcomes.mjs`.\n' }).ok, true);
});

test('a gate script that starts a full review fails', () => {
  const result = outcome({ 'skills/gate/scripts/gate-new.mjs': "const line = `DISPATCH Branch: x`;\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /gate-new\.mjs:1 starts a full review outside the built-in code-review/);
});

test('gate prose that names a redispatch fails', () => {
  const result = outcome({ 'skills/gate/SKILL.md': 'Then redispatch the reviewer.\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /SKILL\.md:1 names a second full review step/);
});
