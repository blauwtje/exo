import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { scanTranscripts } from '../benchmarks/hook-refusals.mjs';
import { denyReason } from '../lib/guard-rules.mjs';
import { tempDir } from './harness.mjs';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const stamp = '2026-11-12T10:00:00Z';

const use = (id, name, input) => ({ timestamp: stamp, message: { content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, text) => ({ timestamp: stamp, message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: text }] } });

function transcriptRoot(entries) {
  const root = tempDir('hook-refusals-scan-');
  fs.mkdirSync(path.join(root, 'project'));
  fs.writeFileSync(path.join(root, 'project', 's.jsonl'), entries.map((entry) => JSON.stringify(entry)).join('\n'));
  return root;
}

test('the scan counts refusals per rule and per tool and flags an unchanged retry', () => {
  const input = { command: 'git stash' };
  const root = transcriptRoot([
    use('a', 'Bash', input),
    result('a', denyReason('stash')),
    use('b', 'Bash', input),
    { timestamp: stamp, type: 'attachment', attachment: { type: 'hook_non_blocking_error', command: 'node hooks/x.mjs' } }
  ]);
  const summary = scanTranscripts({ root, days: 1, now: NOW });
  assert.deepEqual(summary.refusals.byRule, { stash: 1 });
  assert.deepEqual(summary.refusals.byTool, { Bash: 1 });
  assert.deepEqual(summary.hookErrors, { 'node hooks/x.mjs': 1 });
  assert.equal(summary.falsePositiveCandidates.length, 1);
  assert.equal(summary.refusalRate, 0.5);
});

test('a missing transcript folder prints zero counts', () => {
  const summary = scanTranscripts({ root: path.join(tempDir('hook-refusals-none-'), 'absent'), days: 1, now: NOW });
  assert.equal(summary.refusals.total, 0);
  assert.equal(summary.files, 0);
});
