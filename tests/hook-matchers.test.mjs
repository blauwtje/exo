import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkHookMatchers } from '../verify/checks/hook-matchers.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function verdict(repository) {
  const results = [];
  checkHookMatchers({ result: (status, name, detail) => results.push({ status, name, detail }) }, repository);
  return results[0];
}

function sample(config) {
  const root = tempDir('hook-matchers-');
  fs.mkdirSync(path.join(root, 'hooks'));
  fs.writeFileSync(path.join(root, 'hooks', 'hooks.json'), JSON.stringify(config));
  return createRepository(root);
}

test('a tool-event group without a matcher or with a star is flagged', () => {
  const config = { hooks: { PreToolUse: [{ hooks: [] }, { matcher: '*', hooks: [] }, { matcher: 'Bash', hooks: [] }], Stop: [{ hooks: [] }] } };
  const result = verdict(sample(config));
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /^2 hooks\.json group\(s\) on PreToolUse have no matcher/);
});

test('every shipped tool-event group names its tools', () => {
  assert.equal(verdict(createRepository(ROOT)).status, 'PASS');
});
