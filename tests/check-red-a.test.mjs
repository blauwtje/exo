import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivedNames, checkDerivation } from '../verify/checks/derivation.mjs';
import { checkCodexOverrides } from '../verify/checks/codex-overrides.mjs';
import { checkHarnessCapabilities } from '../verify/checks/harness-capabilities.mjs';
import { failures, tree } from './check-outcome.mjs';

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
