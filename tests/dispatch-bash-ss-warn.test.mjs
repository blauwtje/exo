import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');

function transcript(brief) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-warn-')), 'agent.jsonl');
  fs.writeFileSync(file, `${JSON.stringify({ type: 'user', message: { role: 'user', content: brief } })}\n`);
  return file;
}

async function decide(brief) {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'agent-1', agent_type: 'exo:build-task', agent_transcript_path: transcript(brief), tool_input: { command: 'node --test' } };
  return (await dispatchBash(input, undefined, () => false))?.hookSpecificOutput;
}

test('a whole suite in a worker whose brief carries Checks: proof runs with a warning naming the narrowed command', async () => {
  const output = await decide('Build it.\nChecks: proof\nProof: node --test');
  assert.notEqual(output?.permissionDecision, 'deny');
  assert.match(output?.additionalContext ?? '', /node --test '/);
});

test('a whole suite with no Checks line gets no warning', async () => {
  const output = await decide('Build it.\nProof: node --test');
  assert.doesNotMatch(output?.additionalContext ?? '', /narrow/i);
});
