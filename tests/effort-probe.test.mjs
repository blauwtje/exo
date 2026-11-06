import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { probeRecords } from '../benchmarks/effort-probe.mjs';

function subagentsDir(metas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effort-probe-'));
  for (const [agentId, meta] of Object.entries(metas)) {
    fs.writeFileSync(path.join(dir, `agent-${agentId}.meta.json`), JSON.stringify(meta));
  }
  return dir;
}

test('records passed effort beside the effort the transcript shows', () => {
  const dir = subagentsDir({ a1: { effort: 'high' }, b2: { effort: 'low' } });
  const records = probeRecords({ subagents: dir, passed: 'low' });
  assert.deepEqual(records, [
    { agentId: 'a1', passed: 'low', shown: 'high', honored: false },
    { agentId: 'b2', passed: 'low', shown: 'low', honored: true }
  ]);
});

test('a dispatch whose meta shows no effort has shown null and is not honored', () => {
  const dir = subagentsDir({ c3: {} });
  assert.deepEqual(probeRecords({ subagents: dir, passed: 'low' }), [
    { agentId: 'c3', passed: 'low', shown: null, honored: false }
  ]);
});
