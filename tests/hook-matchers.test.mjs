import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { unmatchedGroups } from '../verify/checks/hook-matchers.mjs';

const hooksConfig = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'hooks.json'), 'utf8'));

test('a tool-event group without a matcher or with a star is flagged', () => {
  const config = { hooks: { PreToolUse: [{ hooks: [] }, { matcher: '*', hooks: [] }, { matcher: 'Bash', hooks: [] }], Stop: [{ hooks: [] }] } };
  assert.deepEqual(unmatchedGroups(config), ['PreToolUse', 'PreToolUse']);
});

test('every shipped tool-event group names its tools', () => {
  assert.deepEqual(unmatchedGroups(hooksConfig), []);
});
