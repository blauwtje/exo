import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stopOutput } from '../skills/build/scripts/proof-check.mjs';

function transcript(entries) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'proof-check-')), 'transcript.jsonl');
  fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  return file;
}

const SKILL_CALL = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', id: 'toolu_skill', input: { skill: 'build' } }] } };

function bashCall(id, command) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id, input: { command } }] } };
}

function bashResult(id, text) {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] } };
}

function reportRow(text) {
  return { type: 'assistant', message: { content: [{ type: 'text', text }] } };
}

const STALE_REPORT = reportRow('**Done:** wired it.\nProof: node never-ran.mjs -> ok');
const VALID_REPORT = '**Done:** wired it.\nProof: node x.mjs -> out ok';

test('judges last_assistant_message, not the last text row the transcript already holds', () => {
  const file = transcript([SKILL_CALL, STALE_REPORT, bashCall('toolu_bash1', 'node x.mjs'), bashResult('toolu_bash1', 'out ok')]);
  assert.equal(stopOutput({ transcript_path: file, last_assistant_message: VALID_REPORT }), '');
});

test('blocks on an unbacked last_assistant_message even when the transcript holds a valid older report', () => {
  const file = transcript([SKILL_CALL, bashCall('toolu_bash1', 'node x.mjs'), bashResult('toolu_bash1', 'out ok'), reportRow(VALID_REPORT)]);
  const result = JSON.parse(stopOutput({ transcript_path: file, last_assistant_message: '**Done:** wired it.\nProof: node never-ran.mjs -> ok' }));
  assert.equal(result.decision, 'block');
});

test('falls back to the transcript when last_assistant_message is empty', () => {
  const file = transcript([SKILL_CALL, bashCall('toolu_bash1', 'node x.mjs'), bashResult('toolu_bash1', 'out ok'), reportRow(VALID_REPORT)]);
  assert.equal(stopOutput({ transcript_path: file, last_assistant_message: '' }), '');
});

test('matches a Proof command written as a backtick span followed by a label', () => {
  const file = transcript([SKILL_CALL, bashCall('toolu_bash1', 'node x.mjs'), bashResult('toolu_bash1', 'out ok'), reportRow('**Done:** wired it.\nProof: `node x.mjs` (main checkout) -> out ok')]);
  assert.equal(stopOutput({ transcript_path: file }), '');
});
