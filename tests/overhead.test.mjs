// overhead.mjs books what exo adds to a session from the transcript the
// harness writes, as usage counts per transcript: the exo text in context,
// exo agents' system prompts, calls that only load an exo skill or re-issue a
// refused Read, the read guard's credit, and exo's hook runs. The fixtures pin
// the shapes observed on 2026-09-11.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { emptySession } from '../skills/savings/scripts/ledger.mjs';
import { OVERHEAD_VERSION, overheadTotals } from '../skills/savings/scripts/overhead.mjs';
import { ingestTranscript, isExoProcessFile } from '../skills/savings/scripts/transcript.mjs';
import { fixture } from './harness.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const STOP_HOOK = 'node "${CLAUDE_PLUGIN_ROOT}/skills/savings/scripts/savings.mjs" record';
const SESSION_HOOK = '"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh"';
const LISTING = '- exo:debug: Prove the cause.\n- dataviz: Charts.';
const AGENT_LINES = ['- exo:codebase-scout: Locate files.', '- claude: Catch-all.'];
const SESSION_CONTEXT = '\n# Using exo\n\nEvery exo skill is invoked as exo:<name>.';
const SKILL_BODY = `Base directory for this skill: ${REPOSITORY_ROOT}skills/debug\n\n# Debug\n\nProve the cause first.`;
// The calibrated rates overhead.mjs books at: characters per token of exo text, and milliseconds per exo token a call writes.
const CHARS_PER_TOKEN = 4.043;
const MS_PER_WRITTEN_TOKEN = 0.0368;
const INJECTED = (LISTING.split('\n')[0].length + AGENT_LINES[0].length + SESSION_CONTEXT.length + SKILL_BODY.length) / CHARS_PER_TOKEN;
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

function transcriptNamed(session, suffix) {
  return Object.entries(session.overhead.transcripts).find(([file]) => file.endsWith(suffix))[1];
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

test('exo text is written by the next call and read by every later one, and exo hooks count their time', async () => {
  const session = await ingest(sessionLines(true));
  const counts = transcriptNamed(session, 'session.jsonl').counts;
  near(counts.cache1h, INJECTED);
  near(counts.cacheRead, INJECTED * 2);
  assert.equal(session.overhead.hookMs, 340);
  assert.equal(session.overhead.version, OVERHEAD_VERSION);
});

test('a call that only loads exo skills counts whole, less its own booking of the exo text', async () => {
  const session = await ingest(sessionLines(true));
  const skillCall = session.overhead.calls.msg_skill;
  assert.deepEqual([skillCall.mixed, skillCall.start, skillCall.end], [false, '2026-09-11T10:00:02.000Z', '2026-09-11T10:00:07.000Z']);
  near(skillCall.booked.cache1h, INJECTED);
  assert.equal(session.overhead.calls.msg_mixed.mixed, true);
  assert.equal(session.overhead.calls.msg_text, undefined);
  const totals = overheadTotals(session);
  // msg_skill's usage weighs 5 + 2 × 500 + 10 = 1015; its write of the exo text is booked once, with the transcript.
  near(totals.tokens, 1015 + INJECTED * 0.2);
  near(totals.cost, (5 * 10 + 500 * 20 + 10 * 50 + INJECTED * 2 * 0.25) / 1e6);
  // The exo hooks and the skill call; the time to process the exo text it writes is inside the call, not added again.
  near(totals.time, 340 + 5000);
});

test('text a warm cache served is booked as read, not written', async () => {
  const session = await ingest([...injections(), call('msg_1', '2026-09-11T10:00:05.000Z', TEXT, { counts: { cache1h: 10, cacheRead: 9000 } })]);
  const counts = transcriptNamed(session, 'session.jsonl').counts;
  near(counts.cacheRead, INJECTED);
  assert.equal(counts.cache1h, 0);
});

test('a compaction empties the exo text in context', async () => {
  const session = await ingest([
    ...injections(),
    call('msg_1', '2026-09-11T10:00:05.000Z', TEXT),
    { type: 'system', subtype: 'compact_boundary', timestamp: '2026-09-11T10:00:06.000Z' },
    call('msg_2', '2026-09-11T10:00:07.000Z', TEXT)
  ]);
  const counts = transcriptNamed(session, 'session.jsonl').counts;
  near(counts.cache1h, INJECTED);
  assert.equal(counts.cacheRead, 0);
});

test("an exo agent's system prompt is booked from its meta file and priced at that transcript's model", async () => {
  const agentFile = await fs.readFile(path.join(REPOSITORY_ROOT, 'agents', 'codebase-scout.md'), 'utf8');
  const promptTokens = agentFile.replace(/^---\n[\s\S]*?\n---\n/, '').length / CHARS_PER_TOKEN;
  const agentLines = (prefix) => [
    call(`${prefix}_1`, '2026-09-11T10:00:03.000Z', TEXT, { model: 'claude-sonnet-5', counts: { cache5m: 20000 } }),
    call(`${prefix}_2`, '2026-09-11T10:00:04.000Z', TEXT, { model: 'claude-sonnet-5', counts: { cache5m: 20000 } })
  ];
  const session = await ingest([call('msg_main', '2026-09-11T10:00:05.000Z', TEXT)], {
    subagents: {
      'agent-exo': { meta: { agentType: 'exo:codebase-scout' }, lines: agentLines('msg_exo') },
      'agent-other': { meta: { agentType: 'Explore' }, lines: agentLines('msg_other') }
    }
  });
  const exoAgent = transcriptNamed(session, 'agent-exo.jsonl');
  near(exoAgent.counts.cache5m, promptTokens);
  near(exoAgent.counts.cacheRead, promptTokens);
  assert.equal(exoAgent.model, 'claude-sonnet-5');
  assert.deepEqual(transcriptNamed(session, 'agent-other.jsonl').counts, { input: 0, cacheRead: 0, cache5m: 0, cache1h: 0, output: 0 });
  // Sonnet 5 writes 5-minute cache at $2.50 and reads it at $0.20 per million.
  near(overheadTotals(session).cost, promptTokens * (2.5 + 0.2) / 1e6);
});

test('a model missing from prices.mjs makes the overhead cost unknown', async () => {
  const session = await ingest([...injections(), call('msg_1', '2026-09-11T10:00:05.000Z', TEXT, { model: 'claude-unlisted-9' })]);
  assert.equal(overheadTotals(session).cost, null);
});

test('a refused Read re-issued at once counts whole, and the withheld tokens come back as a credit', async () => {
  const guard = {
    capped: 1, duplicates: 0, hookMs: 120,
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
  const file = Object.keys(session.overhead.transcripts)[0];
  assert.deepEqual(session.overhead.refusals.toolu_1, { transcript: file, calls: 2, entered: 'cache1h' });
  const reissue = session.overhead.calls.msg_2;
  assert.deepEqual([reissue.mixed, reissue.start, reissue.end], [false, '2026-09-11T10:00:02.000Z', '2026-09-11T10:00:05.000Z']);
  const refusalTokens = REFUSAL.length / CHARS_PER_TOKEN;
  const totals = overheadTotals(session);
  // The re-issue weighs 2 + 0.1 × 3000 + 2 × 500 + 40 = 1342, less its write of the refusal text; the text is
  // written once and read once; the 1,000 withheld tokens would have been written once and read once.
  near(totals.tokens, 1342 - refusalTokens * 2 + refusalTokens * 2.1 - 1000 * 2.1);
  // The guard runs and the round trip, less processing the withheld file; processing the refusal text is inside
  // the round trip, not added again.
  near(totals.time, 120 + 3000 - 1000 * MS_PER_WRITTEN_TOKEN);
});

test('a transcript booked by an older version is read again from the start, to the same result', async () => {
  const transcript = await writeTranscript(sessionLines(true));
  const fresh = emptySession();
  ingestTranscript(fresh, transcript);
  const legacy = { ...structuredClone(fresh), overhead: { tokens: 1, hookMs: 0, transcripts: {}, skillCalls: {} } };
  assert.equal(ingestTranscript(legacy, transcript), true);
  assert.deepEqual(legacy.overhead, fresh.overhead);
  assert.deepEqual(legacy.tokens, fresh.tokens);
});

test('lines written into exo process files are kept apart from product code', async () => {
  const processFiles = ['/repo/docs/specs/brief.md', '/repo/docs/plans/plan.md', '/repo/docs/research/node.md', '/repo/.git/implement-next.md',
    '/repo/.git/worktrees/w/implement-next.md', '/private/tmp/designing/exo-20260911-1200/comp.html', '/Users/me/.claude/plans/p.md',
    'C:\\repo\\docs\\specs\\brief.md'];
  for (const filePath of processFiles) assert.equal(isExoProcessFile(filePath), true, filePath);
  for (const filePath of ['/repo/src/docs.ts', '/repo/implement-next.md', '/repo/specs/a.md', undefined]) assert.equal(isExoProcessFile(filePath), false, filePath);
  const session = await ingest([
    { type: 'user', uuid: 'w1', timestamp: '2026-09-11T10:00:01.000Z',
      toolUseResult: { type: 'create', filePath: '/repo/docs/specs/brief.md', content: 'a\nb\nc', originalFile: null, structuredPatch: [] } },
    { type: 'user', uuid: 'w2', timestamp: '2026-09-11T10:00:02.000Z',
      toolUseResult: { filePath: '/repo/src/a.ts', structuredPatch: [{ lines: ['+x', '+y', '-z'] }] } }
  ]);
  assert.deepEqual(session.lines, { added: 2, removed: 1, processAdded: 3 });
});
