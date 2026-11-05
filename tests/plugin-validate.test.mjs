import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkPluginValidate } from '../verify/checks/plugin-validate.mjs';
import { tempDir } from './harness.mjs';

const FAKE_CLAUDE = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_LOG"
printf '%s' "$FAKE_OUTPUT"
exit "$FAKE_STATUS"
`;

const entry = (file, errors = [], warnings = []) => ({ file, errors, warnings, notes: ['ignored'] });

const REFUSED = JSON.stringify({
  success: false,
  manifest: entry('/ROOT/.claude-plugin/plugin.json', [], ['name: unusual']),
  contents: [
    entry('/ROOT/hooks/hooks.json', ['modules../run-watch.mjs: $.agent is used as a value']),
    entry('/ROOT/CLAUDE.md', [], ['root: not loaded as project context'])
  ]
});

const PASSED = JSON.stringify({ success: true, manifest: entry('/ROOT/.claude-plugin/plugin.json'), contents: [entry('/ROOT/hooks/hooks.json')] });

function sandbox({ cli = true, manifest = true, status = 0, output = PASSED } = {}) {
  const base = fs.realpathSync(tempDir('exo-plugin-validate-'));
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
  const env = { PATH: bin, FAKE_LOG: log, FAKE_OUTPUT: output.replaceAll('/ROOT', root), FAKE_STATUS: String(status) };
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

test('a plugin with no finding passes and runs strict JSON mode', () => {
  const box = sandbox();
  const { counts, detail } = verdict(box);
  assert.deepEqual(counts, { PASS: 1, FAIL: 0, WARN: 0, UNRUN: 0 }, detail);
  assert.deepEqual(box.calls(), [`plugin validate --strict --json ${box.root}`]);
});

test('each error and warning is one FAIL detail with its relative file', () => {
  const box = sandbox({ status: 1, output: REFUSED });
  const { counts, detail } = verdict(box);
  assert.equal(counts.FAIL, 3, detail);
  assert.match(detail, /^\[FAIL\] plugin validate: \.claude-plugin\/plugin\.json: name: unusual$/m);
  assert.match(detail, /^\[FAIL\] plugin validate: hooks\/hooks\.json: modules\.\.\/run-watch\.mjs: \$\.agent is used as a value$/m);
  assert.match(detail, /^\[FAIL\] plugin validate: CLAUDE\.md: root: not loaded as project context$/m);
  assert.doesNotMatch(detail, /ignored/);
});

test('output that is not JSON is UNRUN', () => {
  const box = sandbox({ status: 1, output: 'boom' });
  const { counts, detail } = verdict(box);
  assert.deepEqual(counts, { PASS: 0, FAIL: 0, WARN: 0, UNRUN: 1 }, detail);
});

test('an exit other than 0 or 1 is UNRUN', () => {
  const box = sandbox({ status: 2, output: PASSED });
  const { counts, detail } = verdict(box);
  assert.deepEqual(counts, { PASS: 0, FAIL: 0, WARN: 0, UNRUN: 1 }, detail);
});

test('without claude on PATH the check prints an INFO line outside the tally', () => {
  const box = sandbox({ cli: false });
  const { counts, detail } = verdict(box);
  assert.deepEqual(counts, { PASS: 0, FAIL: 0, WARN: 0, UNRUN: 0 }, detail);
  assert.match(detail, /^\[INFO\] plugin validate: skipped: claude is not on PATH$/m);
});

test('a root without a plugin manifest is UNRUN and calls no claude', () => {
  const box = sandbox({ manifest: false });
  const { counts, detail } = verdict(box);
  assert.equal(counts.UNRUN, 1, detail);
  assert.deepEqual(box.calls(), []);
});
