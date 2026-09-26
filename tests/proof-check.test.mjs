import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stopOutput } from '../skills/build-change/scripts/proof-check.mjs';

function transcript(entries) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'proof-check-')), 'transcript.jsonl');
  fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  return file;
}

const SKILL_CALL = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', id: 'toolu_skill', input: { skill: 'build-change' } }] } };

function bashCall(id, command) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id, input: { command } }] } };
}

function bashResult(id, text) {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] } };
}

function finalReport(text) {
  return { type: 'assistant', message: { content: [{ type: 'text', text }] } };
}

test('passes with a real Proof line the session ran', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'node bin/report.js --status paid --file data/sample-orders.csv'),
    bashResult('toolu_bash1', 'orders: 4, total: 913.50 EUR'),
    finalReport('**Done:** wired --status into bin/report.js, commit abc123.\nProof: node bin/report.js --status paid --file data/sample-orders.csv -> orders: 4, total: 913.50 EUR')
  ]);
  assert.equal(stopOutput({ transcript_path: file }), '');
});

test('blocks a Done claim proven only by a test runner', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'npm test'),
    bashResult('toolu_bash1', '# pass 5'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: npm test -> # pass 5')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /test runner/);
});

test('blocks a Proof line whose command was never run', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'npm test'),
    bashResult('toolu_bash1', '# pass 5'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: node bin/report.js --status paid -> orders: 4, total: 913.50 EUR')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
});

test('blocks a Proof line whose output does not match the real tool result', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'node bin/report.js --status paid --file data/sample-orders.csv'),
    bashResult('toolu_bash1', 'orders: 0, total: 0.00 EUR'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: node bin/report.js --status paid --file data/sample-orders.csv -> orders: 4, total: 913.50 EUR')
  ]);
  const result = JSON.parse(stopOutput({ transcript_path: file }));
  assert.equal(result.decision, 'block');
});

test('passes an Unverified line that makes no Done claim', () => {
  const file = transcript([
    SKILL_CALL,
    bashCall('toolu_bash1', 'npm test'),
    bashResult('toolu_bash1', '# pass 5'),
    finalReport('--status wired into bin/report.js.\nUnverified: the real export is unreachable before 16:00.')
  ]);
  assert.equal(stopOutput({ transcript_path: file }), '');
});

test('stays silent when build-change was never called', () => {
  const file = transcript([
    bashCall('toolu_bash1', 'npm test'),
    bashResult('toolu_bash1', '# pass 5'),
    finalReport('**Done:** wired --status into bin/report.js.\nProof: npm test -> # pass 5')
  ]);
  assert.equal(stopOutput({ transcript_path: file }), '');
});

test('stays silent when stop_hook_active is true', () => {
  const file = transcript([
    SKILL_CALL,
    finalReport('**Done:** wired --status into bin/report.js.')
  ]);
  assert.equal(stopOutput({ transcript_path: file, stop_hook_active: true }), '');
});
