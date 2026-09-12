// overhead.mjs books what exo itself cost a session from the transcript the
// harness writes: calls that only load an exo skill or re-issue a refused Read,
// and exo's hook runs. Every figure is a number the harness reported. The
// fixtures pin the shapes observed on 2026-09-11.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { emptySession } from '../skills/savings/scripts/ledger.mjs';
import { OVERHEAD_VERSION, measuredTotals } from '../skills/savings/scripts/overhead.mjs';
import { ingestTranscript } from '../skills/savings/scripts/transcript.mjs';
import { fixture } from './harness.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const STOP_HOOK = 'node "${CLAUDE_PLUGIN_ROOT}/skills/savings/scripts/savings.mjs" record';
const SESSION_HOOK = '"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh"';
const LISTING = '- exo:debug: Prove the cause.\n- dataviz: Charts.';
const AGENT_LINES = ['- general-purpose: Multi-step tasks.', '- claude: Catch-all.'];
const SESSION_CONTEXT = '\n# Using exo\n\nEvery exo skill is invoked as exo:<name>.';
const SKILL_BODY = `Base directory for this skill: ${REPOSITORY_ROOT}skills/debug\n\n# Debug\n\nProve the cause first.`;
const REFUSAL = 'exo read guard: /repo/big.ts has 600 lines and an unbounded read is capped at 400; locate the range first.';
const TEXT = [{ type: 'text', text: 'done' }];

function usage({ input = 5, cacheRead = 0, cache5m = 0, cache1h = 0, output = 10 }) {
  return {
    input_tokens: input, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cache5m + cache1h, output_tokens: output,
    cache_creation: { ephemeral_5m_input_tokens: cache5m, ephemeral_1h_input_tokens: cache1h }
  };
}

function call(id, timestamp, content, { model = 'claude-fable-5-1', counts = { cache1h: 500 } } = {}) {
  return { type: 'assistant', uuid: `${id}-${timestamp}`, timestamp, message: { id, model, usage: usage(counts), content } };
}

function skillUse(name) {
  return { type: 'tool_use', id: `toolu_${name}`, name: 'Skill', input: { skill: name } };
}

function toolResult(uuid, timestamp, block) {
  return { type: 'user', uuid, timestamp, message: { role: 'user', content: [block] } };
}

async function writeTranscript(lines, subagents = {}) {
  const directory = await fixture();
  const transcript = path.join(directory, 'session.jsonl');
  await fs.writeFile(transcript, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  const folder = path.join(directory, 'session', 'subagents');
  for (const [name, agent] of Object.entries(subagents)) {
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, `${name}.jsonl`), `${agent.lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
    await fs.writeFile(path.join(folder, `${name}.meta.json`), JSON.stringify(agent.meta));
  }
  return transcript;
}

async function ingest(lines, { subagents = {}, guard = null } = {}) {
  const session = emptySession();
  if (guard !== null) session.guard = guard;
  ingestTranscript(session, await writeTranscript(lines, subagents));
  return session;
}

function injections() {
  return [
    { type: 'attachment', timestamp: '2026-09-11T10:00:00.000Z', attachment: { type: 'skill_listing', content: LISTING } },
    { type: 'attachment', timestamp: '2026-09-11T10:00:00.000Z', attachment: { type: 'agent_listing_delta', addedLines: AGENT_LINES } },
    { type: 'attachment', timestamp: '2026-09-11T10:00:00.000Z', attachment: { type: 'hook_additional_context', content: [SESSION_CONTEXT] } },
    { type: 'user', isMeta: true, timestamp: '2026-09-11T10:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: SKILL_BODY }] } }
  ];
}

// Hook runs and three calls: one that only loads an exo skill, one that mixes a Read with a skill, and a plain answer.
function sessionLines(withInjections) {
  return [
    { type: 'attachment', timestamp: '2026-09-11T10:00:00.000Z', attachment: { type: 'hook_success', command: SESSION_HOOK, durationMs: 300 } },
    ...(withInjections ? injections() : []),
    { type: 'user', uuid: 'p1', timestamp: '2026-09-11T10:00:02.000Z', message: { role: 'user', content: 'go' } },
    call('msg_skill', '2026-09-11T10:00:07.000Z', [skillUse('exo:debug')]),
    call('msg_mixed', '2026-09-11T10:00:09.000Z', [{ type: 'tool_use', id: 'toolu_read', name: 'Read', input: { file_path: '/repo/a.ts' } }]),
    call('msg_mixed', '2026-09-11T10:00:10.000Z', [skillUse('exo:planning')]),
    call('msg_text', '2026-09-11T10:00:12.000Z', TEXT),
    { type: 'system', subtype: 'stop_hook_summary', timestamp: '2026-09-11T10:00:13.000Z',
      hookInfos: [{ command: STOP_HOOK, durationMs: 40 }, { command: 'node other.mjs', durationMs: 999 }] }
  ];
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
}

test('a call that only loads exo skills counts whole, at the usage and the wall time the harness reported', async () => {
  const session = await ingest(sessionLines(true));
  const skillCall = session.overhead.calls.msg_skill;
  assert.deepEqual([skillCall.mixed, skillCall.start, skillCall.end], [false, '2026-09-11T10:00:02.000Z', '2026-09-11T10:00:07.000Z']);
  assert.equal(session.overhead.calls.msg_mixed.mixed, true);
  assert.equal(session.overhead.calls.msg_text, undefined);
  assert.equal(session.overhead.hookMs, 340);
  assert.equal(session.overhead.version, OVERHEAD_VERSION);
  const totals = measuredTotals(session);
  // msg_skill's usage weighs 5 + 2 × 500 + 10 = 1015, priced at Fable's $10 input, $20 1-hour write and $50 output per million.
  near(totals.tokens, 1015);
  near(totals.cost, (5 * 10 + 500 * 20 + 10 * 50) / 1e6);
  assert.equal(totals.costKnown, true);
  assert.equal(totals.calls, 1);
  // The exo hooks, and the five seconds between the entry before the call and its last line.
  near(totals.time, 340 + 5000);
});

test('a model missing from prices.mjs makes the exo cost unknown', async () => {
  const session = await ingest([
    call('msg_1', '2026-09-11T10:00:05.000Z', [{ type: 'tool_use', id: 'toolu_1', name: 'Skill', input: { skill: 'exo:debug' } }],
      { model: 'claude-unlisted-9' })
  ]);
  const totals = measuredTotals(session);
  assert.equal(totals.costKnown, false);
  assert.equal(totals.calls, 1);
});

test('a refused Read re-issued at once counts whole, and the guard reports the bytes it withheld', async () => {
  const guard = {
    hookMs: 120,
    refusals: { toolu_1: { kind: 'capped', bytesWithheld: 4000, reader: 'main', filePath: '/repo/big.ts', open: true } }
  };
  const session = await ingest([
    call('msg_1', '2026-09-11T10:00:01.000Z', [{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/repo/big.ts' } }]),
    toolResult('r1', '2026-09-11T10:00:02.000Z', { type: 'tool_result', tool_use_id: 'toolu_1', is_error: true, content: REFUSAL }),
    call('msg_2', '2026-09-11T10:00:05.000Z', [{ type: 'tool_use', id: 'toolu_2', name: 'Read', input: { file_path: '/repo/big.ts', offset: 1, limit: 50 } }],
      { counts: { input: 2, cacheRead: 3000, cache1h: 500, output: 40 } }),
    toolResult('r2', '2026-09-11T10:00:06.000Z', { type: 'tool_result', tool_use_id: 'toolu_2', content: 'line 1' }),
    call('msg_3', '2026-09-11T10:00:08.000Z', TEXT)
  ], { guard });
  const reissue = session.overhead.calls.msg_2;
  assert.deepEqual([reissue.mixed, reissue.start, reissue.end], [false, '2026-09-11T10:00:02.000Z', '2026-09-11T10:00:05.000Z']);
  const totals = measuredTotals(session);
  // The re-issue weighs 2 + 0.1 × 3000 + 2 × 500 + 40 = 1342; the plain Read before it is the session's own work.
  near(totals.tokens, 1342);
  assert.equal(totals.calls, 1);
  // The guard's own runs, and the three seconds of the round trip.
  near(totals.time, 120 + 3000);
  assert.deepEqual([totals.refusals, totals.bytesWithheld], [1, 4000]);
});

test('a transcript booked by an older version is read again from the start, to the same result', async () => {
  const transcript = await writeTranscript(sessionLines(true));
  const fresh = emptySession();
  ingestTranscript(fresh, transcript);
  const legacy = { ...structuredClone(fresh), overhead: { tokens: 1, hookMs: 0, transcripts: {}, skillCalls: {} } };
  assert.equal(ingestTranscript(legacy, transcript), true);
  assert.deepEqual(legacy.overhead, fresh.overhead);
  assert.deepEqual(legacy.usageById, fresh.usageById);
});
