import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRepository } from '../verify/repository.mjs';
import { derivedNames, checkDerivation } from '../verify/checks/derivation.mjs';
import { checkCodexOverrides } from '../verify/checks/codex-overrides.mjs';
import { checkHarnessCapabilities } from '../verify/checks/harness-capabilities.mjs';

function recorder() {
  const results = [];
  const result = (...entry) => results.push({ status: entry[0], name: entry[1], detail: entry[2] });
  return {
    results,
    result,
    assert: (...entry) => result(entry[0] ? 'PASS' : 'FAIL', entry[1], entry[0] ? entry[2] : entry[3])
  };
}

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-check-red-'));
  for (const [relativePath, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), text);
  }
  return root;
}

function failures(check, root) {
  const report = recorder();
  check(report, createRepository(root));
  return report.results.filter((entry) => entry.status === 'FAIL');
}

test('codex overrides fails on a tree the rules cannot generate', () => {
  const [failure] = failures(checkCodexOverrides, tree({ 'README.md': 'x\n' }));
  assert.equal(failure.name, 'codex overrides');
});

test('derivation fails on a derived name and on a notice file', () => {
  const root = tree({ 'notes.md': `see ${derivedNames()[0]}\n`, NOTICE: 'x\n' });
  const [failure] = failures(checkDerivation, root);
  assert.match(failure.detail, /derived name/);
  assert.match(failure.detail, /NOTICE exists/);
});

test('harness capabilities fails when the capability files are missing', () => {
  const [failure] = failures(checkHarnessCapabilities, tree({ 'README.md': 'x\n' }));
  assert.equal(failure.name, 'harness capabilities');
});
