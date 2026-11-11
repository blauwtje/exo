import assert from 'node:assert/strict';
import test from 'node:test';
import { researchFields } from '../lib/research-route.mjs';

const call = (subagent_type, prompt) => ({ tool_name: 'Agent', session_id: 's-cut', tool_input: { subagent_type, prompt } });
const piped = 'Sources: web\nRun gh api repos/o/r/readme | head -c 4000 and answer.';

test('research worker brief that cuts a page with head -c warns', () => {
  const fields = researchFields(call('exo:research-worker', piped));
  assert.equal(fields.permissionDecision, undefined);
  assert.match(fields.additionalContext, /fetch\.mjs/);
});

test('head --bytes and cut -c warn too', () => {
  for (const cutter of ['head --bytes 900', 'cut -c1-500']) {
    const fields = researchFields(call('exo:research-worker', `Sources: web\ngh api x | ${cutter}`));
    assert.match(fields?.additionalContext, /fetch\.mjs/, cutter);
  }
});

test('the same brief without the pipe is allowed', () => {
  assert.equal(researchFields(call('exo:research-worker', 'Sources: repo\nRead the readme of o/r.')), null);
});

test('a general-purpose build brief with head -c is allowed', () => {
  assert.equal(researchFields(call('general-purpose', 'Show the log with tail .exo/run.log | head -c 4000')), null);
});
