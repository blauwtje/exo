import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkPluginValidate, errorLines } from '../verify/checks/plugin-validate.mjs';

const FAKE_CLAUDE = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_LOG"
printf '%s' "$FAKE_OUTPUT"
exit "$FAKE_STATUS"
`;

const REFUSED = [
  'Validating plugin: /p/CLAUDE.md', '',
  '⚠ Found 1 warning:', '',
  '  ❯ root: CLAUDE.md at the plugin root is not loaded as project context.', '',
  'Validating hooks: /p/hooks/hooks.json', '',
  '✘ Found 2 errors:', '',
  '  ❯ modules../run-watch.mjs: run-watch.mjs:119: $.agent is used as a value',
  '  ❯ modules../other.mjs: other.mjs:3: $.ui is used as a value', '',
  '✘ Validation failed', ''
].join('\n');

const PASSED = [
  'Validating hooks: /p/hooks/hooks.json', '',
  '  ❯ ./run-watch.mjs calls: $.agent.list (via agentLive)', '',
  '✔ Validation passed', ''
].join('\n');

function sandbox(t, { cli = true, manifest = true, status = 0, output = PASSED } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-plugin-validate-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const bin = path.join(base, 'bin');
  const root = path.join(base, 'plugin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
  if (manifest) {
    fs.mkdirSync(path.join(root, '.claude-plugin'));
    fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), '{"name":"fixture"}\n', 'utf8');
  }
  if (cli) fs.writeFileSync(path.join(bin, 'claude'), FAKE_CLAUDE, { mode: 0o755 });
  const log = path.join(base, 'calls.log');
  const env = { PATH: bin, FAKE_LOG: log, FAKE_OUTPUT: output, FAKE_STATUS: String(status) };
  return { root, env, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []) };
}

function verdict(box) {
  const report = createReport();
  const printed = [];
  const log = console.log;
  console.log = (line) => printed.push(String(line));
  try {
    checkPluginValidate(report, createRepository(box.root), { env: box.env });
  } finally {
    console.log = log;
  }
  return { counts: report.counts(), detail: printed.join('\n') };
}

test('a plugin the engine accepts passes, warnings and call lines aside', (t) => {
  const box = sandbox(t);
  const { counts, detail } = verdict(box);
  assert.deepEqual(counts, { PASS: 1, FAIL: 0, WARN: 0, UNRUN: 0 }, detail);
  assert.deepEqual(box.calls(), [`plugin validate ${box.root}`]);
});

test('a refused plugin fails and shows the error lines, not the warning', (t) => {
  const box = sandbox(t, { status: 1, output: REFUSED });
  const { counts, detail } = verdict(box);
  assert.equal(counts.FAIL, 1, detail);
  assert.match(detail, /^\[FAIL\] plugin validate: claude plugin validate exits 1: modules\.\.\/run-watch\.mjs: run-watch\.mjs:119: \$\.agent is used as a value; modules\.\.\/other\.mjs/m);
  assert.doesNotMatch(detail, /CLAUDE\.md at the plugin root/);
});

test('a failure without error lines shows the first output lines', (t) => {
  const box = sandbox(t, { status: 2, output: 'boom\n\nsecond\nthird\nfourth\n' });
  const { counts, detail } = verdict(box);
  assert.equal(counts.FAIL, 1, detail);
  assert.match(detail, /exits 2: boom; second; third; 1 more$/m);
});

test('without claude on PATH the check prints an INFO line outside the tally', (t) => {
  const box = sandbox(t, { cli: false });
  const { counts, detail } = verdict(box);
  assert.deepEqual(counts, { PASS: 0, FAIL: 0, WARN: 0, UNRUN: 0 }, detail);
  assert.match(detail, /^\[INFO\] plugin validate: skipped: claude is not on PATH$/m);
});

test('a root without a plugin manifest is UNRUN and calls no claude', (t) => {
  const box = sandbox(t, { manifest: false });
  const { counts, detail } = verdict(box);
  assert.equal(counts.UNRUN, 1, detail);
  assert.deepEqual(box.calls(), []);
});

test('errorLines keeps the lines under an error heading only', () => {
  assert.deepEqual(errorLines(PASSED), []);
  assert.equal(errorLines(REFUSED).length, 2);
});
