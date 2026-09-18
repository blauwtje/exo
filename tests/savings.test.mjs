// The savings record reads the transcript the harness writes: one line per
// content block sharing a message id, and streaming repeats with a growing
// output count. These fixtures pin the shape observed on 2026-09-11; a format
// change shows up here first. Every figure the panel prints comes out of
// these fixtures, never out of a ratio applied to one.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { OVERHEAD_VERSION } from '../skills/savings/scripts/overhead.mjs';
import { sumTokens } from '../skills/savings/scripts/transcript.mjs';
import { fixture, run } from './harness.mjs';

const SAVINGS = fileURLToPath(new URL('../skills/savings/scripts/savings.mjs', import.meta.url));

function runWithStdin(args, input, env) {
  return run(SAVINGS, args, { env, input });
}

function usage(output, extra = {}) {
  return { input_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 200, output_tokens: output, ...extra };
}

const MAIN_USAGE = {
  input_tokens: 10,
  cache_creation_input_tokens: 1000,
  cache_read_input_tokens: 2000,
  output_tokens: 100,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1000 }
};

const MAIN_LINES = [
  { type: 'assistant', uuid: 'a1', timestamp: '2026-09-11T10:00:00.000Z',
    message: { id: 'msg_A', model: 'claude-fable-5-1', usage: MAIN_USAGE, content: [{ type: 'thinking' }] } },
  { type: 'assistant', uuid: 'a2', timestamp: '2026-09-11T10:00:01.000Z',
    message: { id: 'msg_A', model: 'claude-fable-5-1', usage: MAIN_USAGE, content: [{ type: 'tool_use' }] } },
  { type: 'user', uuid: 'u1', timestamp: '2026-09-11T10:01:00.000Z',
    toolUseResult: { filePath: '/x/a.js', oldString: 'old', newString: 'new', structuredPatch: [{ lines: ['-old', '+new1', '+new2', '+new3', ' context'] }] } },
  { type: 'user', uuid: 'u2', timestamp: '2026-09-11T10:02:00.000Z',
    toolUseResult: { type: 'create', filePath: '/x/b.js', content: 'l1\nl2\nl3\nl4\nl5', originalFile: null, structuredPatch: [] } },
  { type: 'user', uuid: 'u3', timestamp: '2026-09-11T10:03:00.000Z',
    toolUseResult: { type: 'update', filePath: '/x/c.js', content: 'n1\nn2', originalFile: 'o1\no2\no3', structuredPatch: [] } }
];

const DELEGATE_LINES = [4, 4, 407].map((output, index) => ({
  type: 'assistant', uuid: `s${index}`, timestamp: '2026-09-11T10:02:30.000Z', isSidechain: true,
  message: { id: 'msg_B', model: 'claude-sonnet-5', usage: usage(output), content: [{ type: 'text' }] }
}));

function jsonLines(lines) {
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}

async function writeConfig(configDirectory, config = {}) {
  const file = path.join(configDirectory, 'exo', 'savings', 'config.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(config));
}

async function transcriptFixture(mainLines = MAIN_LINES, delegateLines = DELEGATE_LINES) {
  const directory = await fixture();
  const transcript = path.join(directory, 'session-1.jsonl');
  await fs.writeFile(transcript, `${jsonLines(mainLines)}not json\n`);
  const subagents = path.join(directory, 'session-1', 'subagents');
  await fs.mkdir(subagents, { recursive: true });
  await fs.writeFile(path.join(subagents, 'agent-s.jsonl'), jsonLines(delegateLines));
  await writeConfig(directory);
  return { configDirectory: directory, transcript };
}

async function readRecord(configDirectory) {
  const file = path.join(configDirectory, 'exo', 'savings', 'sessions.json');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeRecord(configDirectory, sessions) {
  const file = path.join(configDirectory, 'exo', 'savings', 'sessions.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(sessions));
}

// A record row as the current version books it: the calls that were exo's own,
// the usage the API reported for them, and the guard's refusals.
function bookedRow({ calls = {}, usageById = {}, guard = {}, hookMs = 0 }) {
  return {
    overhead: { version: OVERHEAD_VERSION, hookMs, transcripts: {}, calls },
    usageById,
    guard: { hookMs: 0, refusals: {}, ...guard }
  };
}

// One exo call of 2,000 input and 400 output tokens over 118 seconds, two
// seconds of guard runs, and 1.5 MB withheld over two refusals.
function measuredRow() {
  return bookedRow({
    calls: { msg_1: { kind: 'skill', mixed: false, start: '2026-09-11T10:00:00.000Z', end: '2026-09-11T10:01:58.000Z' } },
    usageById: { msg_1: { input: 2000, cacheRead: 0, cache5m: 0, cache1h: 0, output: 400, model: 'claude-fable-5-1' } },
    guard: {
      hookMs: 2000,
      refusals: {
        toolu_1: { kind: 'capped', bytesWithheld: 1048576, reader: 'main', filePath: '/repo/big.ts', open: true },
        toolu_2: { kind: 'duplicate', bytesWithheld: 524288, reader: 'main', filePath: '/repo/big.ts', open: true }
      }
    }
  });
}

test('record sums usage once per message id and weights the cache', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  const first = await runWithStdin(['record'], JSON.stringify({ session_id: 's1', transcript_path: transcript }), env);
  assert.equal(first.code, 0, first.stderr);
  const session = (await readRecord(configDirectory)).s1;
  assert.deepEqual(sumTokens(session), {
    input: 15, cacheRead: 2000, cache5m: 200, cache1h: 1000, output: 507, raw: 3722, weightedInput: 2465
  });
  assert.equal(session.model, 'claude-fable-5-1');
  assert.equal(session.transcript, transcript);
  assert.equal(session.started, '2026-09-11T10:00:00.000Z');
  assert.equal(session.updated, '2026-09-11T10:03:00.000Z');
  assert.deepEqual(session.guard, { hookMs: 0, refusals: {} });
});

test('record is idempotent across runs and appended lines are picked up', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  const hookInput = JSON.stringify({ session_id: 's1', transcript_path: transcript });
  await runWithStdin(['record'], hookInput, env);
  await runWithStdin(['record'], hookInput, env);
  let session = (await readRecord(configDirectory)).s1;
  assert.equal(sumTokens(session).output, 507);

  const appended = { type: 'assistant', uuid: 'a9', timestamp: '2026-09-11T10:09:00.000Z',
    message: { id: 'msg_C', model: 'claude-fable-5-1', usage: usage(50), content: [{ type: 'text' }] } };
  await fs.appendFile(transcript, `${JSON.stringify(appended)}\n`);
  await runWithStdin(['record'], hookInput, env);
  session = (await readRecord(configDirectory)).s1;
  assert.equal(sumTokens(session).output, 557);
  assert.equal(session.updated, '2026-09-11T10:09:00.000Z');
});

test('a row booked by an older version is read again from its transcript when the report runs', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const transcript = path.join(directory, 'projects', '-repo', 's9.jsonl');
  await fs.mkdir(path.dirname(transcript), { recursive: true });
  await fs.writeFile(transcript, jsonLines(MAIN_LINES));
  await writeRecord(directory, { s9: { started: '2026-09-11T10:00:00.000Z', overhead: null } });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  const session = (await readRecord(directory)).s9;
  assert.equal(session.transcript, transcript);
  assert.equal(session.overhead.version, OVERHEAD_VERSION);
  assert.equal(sumTokens(session).output, 100);
});

test('reading older rows again neither brings back an expired row nor moves a row\'s touched', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const daysAgo = (count) => new Date(Date.now() - count * 24 * 60 * 60 * 1000).toISOString();
  const recent = daysAgo(2);
  await writeRecord(directory, { expired1: { touched: daysAgo(40), overhead: null }, expired2: { touched: daysAgo(40), overhead: null }, recent: { touched: recent, overhead: null } });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  const record = await readRecord(directory);
  assert.deepEqual(Object.keys(record), ['recent']);
  assert.equal(record.recent.touched, recent);
  assert.equal(record.recent.overhead.version, OVERHEAD_VERSION);
});

test('the report is a few fenced lines: cost, refusals and a saving that is not measured', async () => {
  const directory = await fixture();
  await writeConfig(directory, { readGuardLines: 800 });
  const env = { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '', EXO_SAVINGS: '' };
  await writeRecord(directory, { s1: measuredRow() });
  const result = await run(SAVINGS, ['report'], { env, cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  // 2,000 input and 400 output price at Fable's $10 and $50 per million;
  // two seconds of hook runs and 118 seconds of call.
  const lines = result.stdout.trimEnd().split('\n');
  assert.deepEqual(lines, [
    '```text',
    'exo savings · on · last 30 days · 1 session',
    'Cost     $0.04 · 1 call · 2m',
    'Refused  2 reads · 1.5 MB of file text never sent',
    'Saved    not measured: refused text has no token count or price',
    'Skills   none 0',
    '```',
    'Turn off with `/exo:savings off`.'
  ]);
  // No box, no table, no estimate and no internal name.
  assert.doesNotMatch(result.stdout, /│|┌|≈|withheld|record/);
});

test('the report names the skills that fired, most first, and the turns that matched none', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const env = { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '', EXO_SAVINGS: '' };
  const routed = { ...measuredRow(), routing: { open: false, fired: false, skills: { planning: 1, implementing: 4 }, none: 7 } };
  await writeRecord(directory, { s1: routed });
  const result = await run(SAVINGS, ['report'], { env, cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Skills   implementing 4 · planning 1 · none 7$/m);
});

test('an empty counter prints a report of zeros', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^exo savings · on · last 30 days · 0 sessions$/m);
  assert.match(result.stdout, /^Cost     \$0\.00 · 0 calls · 0m$/m);
  assert.match(result.stdout, /^Refused  0 reads · 0 B of file text never sent$/m);
});

test('the status line segment leads with cost and counts refusals, never tokens or refused bytes', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  await writeRecord(directory, { s1: measuredRow() });
  const env = { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' };
  assert.equal((await runWithStdin(['statusline'], '{}', env)).stdout, 'exo cost $0.04 · 2m · 2 reads refused');
});

test('a Skill call to an exo skill reaches the segment from the transcript alone', async () => {
  const lines = [
    { type: 'user', uuid: 'u0', timestamp: '2026-09-11T10:00:00.000Z', message: { role: 'user', content: 'go' } },
    { type: 'assistant', uuid: 'a1', timestamp: '2026-09-11T10:02:00.000Z',
      message: { id: 'msg_S', model: 'claude-fable-5-1',
        usage: { input_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 400 },
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'Skill', input: { skill: 'exo:debug' } }] } }
  ];
  const { configDirectory, transcript } = await transcriptFixture(lines, []);
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  await runWithStdin(['record'], JSON.stringify({ session_id: 's1', transcript_path: transcript }), env);
  assert.equal((await runWithStdin(['statusline'], '{}', env)).stdout, 'exo cost $0.04 · 2m · 0 reads refused');
});

test('a call whose model has no price dashes every cost it reaches', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const env = { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' };
  const counts = { input: 1000, cacheRead: 0, cache5m: 0, cache1h: 0, output: 0 };
  const priced = bookedRow({ calls: { m1: { kind: 'skill', mixed: false, start: null, end: null } },
    usageById: { m1: { ...counts, model: 'claude-fable-5-1' } } });
  const unpriced = bookedRow({ calls: { m2: { kind: 'skill', mixed: false, start: null, end: null } },
    usageById: { m2: { ...counts, model: 'claude-unlisted-9' } } });
  await writeRecord(directory, { s1: priced, s2: unpriced });
  const result = await runWithStdin(['report'], '', env);
  assert.equal(result.code, 0, result.stderr);
  // One of the two sessions has no price, so the cost over both cannot be totalled.
  assert.match(result.stdout, /^Cost     - · 2 calls · 0m$/m);
});

test('an unknown command fails with usage', async () => {
  const result = await runWithStdin(['bogus'], '', {});
  assert.equal(result.code, 1);
  assert.match(result.stderr, /usage: savings\.mjs record\|statusline\|report/);
});

test('a CLI command exits non-zero and surfaces the error when the config directory is a file', async () => {
  const directory = await fixture();
  const configFile = path.join(directory, 'config-is-a-file');
  await fs.writeFile(configFile, 'not a directory');
  const result = await runWithStdin(['off'], '', { CLAUDE_CONFIG_DIR: configFile });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /^savings: /);
});

test('record and statusline stand down when EXO_SAVINGS=off', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS: 'off' };
  const recorded = await runWithStdin(['record'], JSON.stringify({ session_id: 's1', transcript_path: transcript }), env);
  assert.equal(recorded.code, 0, recorded.stderr);
  const rendered = await runWithStdin(['statusline'], JSON.stringify({ session_id: 's1', transcript_path: transcript }), env);
  assert.equal(rendered.stdout, '');
  assert.equal(await fs.access(path.join(configDirectory, 'exo', 'savings', 'sessions.json')).catch(() => 'absent'), 'absent');
});

test('off and on write enabled into config.json, never the ratios, and status reports it', async () => {
  const directory = await fixture();
  const env = { CLAUDE_CONFIG_DIR: directory };
  const configFile = path.join(directory, 'exo', 'savings', 'config.json');
  assert.equal((await runWithStdin(['status'], '', env)).stdout, 'on\n');
  assert.equal((await runWithStdin(['off'], '', env)).stdout, 'exo savings off; the counter, the status line segment and the read guard follow at once\n');
  assert.equal(JSON.parse(await fs.readFile(configFile, 'utf8')).enabled, false);
  assert.equal((await runWithStdin(['status'], '', env)).stdout, 'off\n');
  const panel = (await runWithStdin(['report'], '', env)).stdout;
  assert.match(panel, /^exo savings · off · /m);
  assert.match(panel, /^Turn on with `\/exo:savings on`\.$/m);
  assert.equal((await runWithStdin(['on'], '', env)).stdout, 'exo savings on; the counter, the status line segment and the read guard follow at once\n');
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  assert.equal(config.enabled, true);
  assert.equal(config.ratios, undefined);
});

test('the record command does not rewrite a savings record it cannot parse, and exits 0 with the error on stderr', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const record = path.join(configDirectory, 'exo', 'savings', 'sessions.json');
  await fs.writeFile(record, '{not json');
  const hookInput = JSON.stringify({ session_id: 's1', transcript_path: transcript });
  const result = await runWithStdin(['record'], hookInput, { CLAUDE_CONFIG_DIR: configDirectory });
  assert.equal(result.code, 0);
  assert.match(result.stderr, /^savings: .*sessions\.json is not valid JSON/m);
  assert.equal(await fs.readFile(record, 'utf8'), '{not json');
});

test('record without a transcript path books an empty row and exits 0', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const result = await runWithStdin(['record'], JSON.stringify({ session_id: 's1' }), { CLAUDE_CONFIG_DIR: directory });
  assert.equal(result.code, 0, result.stderr);
  const session = (await readRecord(directory)).s1;
  assert.equal(session.transcript, null);
  assert.deepEqual(session.usageById, {});
});

test('the cost and duration the status line reports are never stored in the record', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const statusInput = { session_id: 's1', transcript_path: transcript, cost: { total_cost_usd: 1.23, total_duration_ms: 4000 } };
  const result = await runWithStdin(['statusline'], JSON.stringify(statusInput), { CLAUDE_CONFIG_DIR: configDirectory });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^exo /);
  const session = (await readRecord(configDirectory)).s1;
  for (const field of ['costUsd', 'durationMs', 'tokens', 'lines', 'linesByEntry']) {
    assert.equal(Object.hasOwn(session, field), false, field);
  }
});

test('a row whose transcript is gone gets an empty overhead and keeps its transcript path', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const gone = path.join(directory, 'gone.jsonl');
  await writeRecord(directory, { s9: { transcript: gone, overhead: null } });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  const session = (await readRecord(directory)).s9;
  assert.deepEqual(session.overhead, { version: OVERHEAD_VERSION, hookMs: 0, transcripts: {}, calls: {} });
  assert.equal(session.transcript, gone);
});

test('a switch under an EXO_SAVINGS override says the environment outranks it', async () => {
  const directory = await fixture();
  const result = await runWithStdin(['off'], '', { CLAUDE_CONFIG_DIR: directory, EXO_SAVINGS: 'on' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^EXO_SAVINGS=on in the environment outranks the switch\.$/m);
});

test('guard-lines writes readGuardLines beside the other switches, and refuses a value that is not a whole number of at least 1', async () => {
  const directory = await fixture();
  const env = { CLAUDE_CONFIG_DIR: directory };
  const configFile = path.join(directory, 'exo', 'savings', 'config.json');
  await runWithStdin(['off'], '', env);
  const raised = await run(SAVINGS, ['guard-lines', '800'], { env });
  assert.equal(raised.code, 0, raised.stderr);
  assert.equal(raised.stdout, 'exo read guard now refuses a whole-file read of a file over 800 lines\n');
  assert.deepEqual(JSON.parse(await fs.readFile(configFile, 'utf8')), { enabled: false, readGuard: true, readGuardLines: 800 });
  for (const value of ['0', '-5', '12.5', 'lots']) {
    const refused = await run(SAVINGS, ['guard-lines', value], { env });
    assert.equal(refused.code, 1, value);
    assert.match(refused.stderr, /^savings: guard-lines needs a whole number of at least 1/);
  }
  const missing = await run(SAVINGS, ['guard-lines'], { env });
  assert.equal(missing.code, 1);
  assert.equal(JSON.parse(await fs.readFile(configFile, 'utf8')).readGuardLines, 800);
});
