import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { unmatchedGroups } from '../verify/checks/hook-matchers.mjs';
import { entriesOf, payloadFor, percentile, sampleTool } from '../benchmarks/hook-cost.mjs';

const hooksConfig = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'hooks.json'), 'utf8'));

test('a tool-event group without a matcher or with a star is flagged', () => {
  const config = { hooks: { PreToolUse: [{ hooks: [] }, { matcher: '*', hooks: [] }, { matcher: 'Bash', hooks: [] }], Stop: [{ hooks: [] }] } };
  assert.deepEqual(unmatchedGroups(config), ['PreToolUse', 'PreToolUse']);
});

test('every shipped tool-event group names its tools', () => {
  assert.deepEqual(unmatchedGroups(hooksConfig), []);
});

test('the cost bench covers every hooks.json entry with a payload of its own event', () => {
  const entries = entriesOf(hooksConfig);
  assert.ok(entries.length >= 8);
  for (const entry of entries) assert.equal(payloadFor(entry, '/x').hook_event_name, entry.event);
});

test('the bench samples an mcp matcher as an mcp tool and takes a high percentile', () => {
  assert.equal(sampleTool('Read|mcp__.*'), 'Read');
  assert.equal(sampleTool('mcp__.*'), 'mcp__x__y');
  assert.equal(percentile([1, 2, 3, 4, 100], 0.95), 100);
});
