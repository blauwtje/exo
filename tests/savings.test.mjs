// The savings ledger reads the transcript the harness writes: one line per
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

async function readLedger(configDirectory) {
  const file = path.join(configDirectory, 'exo', 'savings', 'sessions.json');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeLedger(configDirectory, sessions) {
  const file = path.join(configDirectory, 'exo', 'savings', 'sessions.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(sessions));
}

// A ledger row as the current version books it: the calls that were exo's own,
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
    calls: { msg_1: { mixed: false, start: '2026-09-11T10:00:00.000Z', end: '2026-09-11T10:01:58.000Z' } },
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
  const session = (await readLedger(configDirectory)).s1;
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
  let session = (await readLedger(configDirectory)).s1;
  assert.equal(sumTokens(session).output, 507);

  const appended = { type: 'assistant', uuid: 'a9', timestamp: '2026-09-11T10:09:00.000Z',
    message: { id: 'msg_C', model: 'claude-fable-5-1', usage: usage(50), content: [{ type: 'text' }] } };
  await fs.appendFile(transcript, `${JSON.stringify(appended)}\n`);
  await runWithStdin(['record'], hookInput, env);
  session = (await readLedger(configDirectory)).s1;
  assert.equal(sumTokens(session).output, 557);
  assert.equal(session.updated, '2026-09-11T10:09:00.000Z');
});

test('a row booked by an older version is read again from its transcript when the report runs', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const transcript = path.join(directory, 'projects', '-repo', 's9.jsonl');
  await fs.mkdir(path.dirname(transcript), { recursive: true });
  await fs.writeFile(transcript, jsonLines(MAIN_LINES));
  await writeLedger(directory, { s9: { started: '2026-09-11T10:00:00.000Z', overhead: null } });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  const session = (await readLedger(directory)).s9;
  assert.equal(session.transcript, transcript);
  assert.equal(session.overhead.version, OVERHEAD_VERSION);
  assert.equal(sumTokens(session).output, 100);
});

test('reading older rows again neither brings back an expired row nor moves a row\'s touched', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const daysAgo = (count) => new Date(Date.now() - count * 24 * 60 * 60 * 1000).toISOString();
  const recent = daysAgo(2);
  await writeLedger(directory, { expired1: { touched: daysAgo(40), overhead: null }, expired2: { touched: daysAgo(40), overhead: null }, recent: { touched: recent, overhead: null } });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  const ledger = await readLedger(directory);
  assert.deepEqual(Object.keys(ledger), ['recent']);
  assert.equal(ledger.recent.touched, recent);
  assert.equal(ledger.recent.overhead.version, OVERHEAD_VERSION);
});

test('the panel reports the guard refusals and the calls that were exo alone, and nothing estimated', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const env = { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' };
  await writeLedger(directory, { s1: measuredRow() });
  const result = await run(SAVINGS, ['report'], { env, cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  // Fenced, because the columns line up only in a monospace block.
  assert.match(result.stdout, /^```text$/m);
  assert.match(result.stdout, /^✻ exo ledger · ● on · all projects$/m);
  // Every session in one grid, in one project or another: no section per project.
  assert.doesNotMatch(result.stdout, /^── /m);
  assert.match(result.stdout, /^reads refused\s+2$/m);
  assert.match(result.stdout, /^context withheld\s+1\.5 MB$/m);
  assert.match(result.stdout, /^exo calls\s+1$/m);
  // 2,000 input and 400 output weigh 2,400 and price at Fable's $10 and $50 per million.
  assert.match(result.stdout, /^exo tokens\s+2\.4k$/m);
  assert.match(result.stdout, /^exo cost\s+\$0\.04$/m);
  // Two seconds of hook runs and 118 seconds of call.
  assert.match(result.stdout, /^exo time\s+2m$/m);
  assert.match(result.stdout, /^Turn off with `\/exo:savings off`\.$/m);
  // No row is an estimate, so no row is approximate and nothing is called saved.
  assert.doesNotMatch(result.stdout, /≈|saved/);
});

test('the status line segment carries the same measured figures', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  await writeLedger(directory, { s1: measuredRow() });
  const env = { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' };
  assert.equal((await runWithStdin(['statusline'], '{}', env)).stdout, 'exo 1.5 MB withheld · 2.4k tok · $0.04 · 2m');
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
  assert.equal((await runWithStdin(['statusline'], '{}', env)).stdout, 'exo 0 B withheld · 2.4k tok · $0.04 · 2m');
});

test('a call whose model has no price dashes the cost row', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const env = { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' };
  const counts = { input: 1000, cacheRead: 0, cache5m: 0, cache1h: 0, output: 0 };
  const priced = bookedRow({ calls: { m1: { mixed: false, start: null, end: null } },
    usageById: { m1: { ...counts, model: 'claude-fable-5-1' } } });
  const unpriced = bookedRow({ calls: { m2: { mixed: false, start: null, end: null } },
    usageById: { m2: { ...counts, model: 'claude-unlisted-9' } } });
  await writeLedger(directory, { s1: priced, s2: unpriced });
  const result = await runWithStdin(['report'], '', env);
  assert.equal(result.code, 0, result.stderr);
  // One of the two sessions has no price, so the cost over both cannot be totalled.
  assert.match(result.stdout, /^exo cost\s+-$/m);
});

test('every row of the panel is padded to one width', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const env = { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' };
  await writeLedger(directory, { s1: measuredRow() });
  const result = await run(SAVINGS, ['report'], { env, cwd: directory });
  assert.equal(result.code, 0, result.stderr);
  const grid = result.stdout.split('\n').filter((line) => /^(?:reads refused|context withheld|exo calls|exo tokens|exo cost|exo time)/.test(line));
  assert.equal(grid.length, 6);
  const widths = new Set(grid.map((line) => [...line].length));
  assert.equal(widths.size, 1, [...widths].join(', '));
  assert.ok([...widths][0] <= 60, `panel is ${[...widths][0]} columns`);
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
  assert.match(panel, /^✻ exo ledger · ○ off · all projects$/m);
  assert.match(panel, /^Turn on with `\/exo:savings on`\.$/m);
  assert.equal((await runWithStdin(['on'], '', env)).stdout, 'exo savings on; the counter, the status line segment and the read guard follow at once\n');
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  assert.equal(config.enabled, true);
  assert.equal(config.ratios, undefined);
});

test('record leaves a ledger that does not parse untouched and exits 0 with the error on stderr', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const ledger = path.join(configDirectory, 'exo', 'savings', 'sessions.json');
  await fs.writeFile(ledger, '{not json');
  const hookInput = JSON.stringify({ session_id: 's1', transcript_path: transcript });
  const result = await runWithStdin(['record'], hookInput, { CLAUDE_CONFIG_DIR: configDirectory });
  assert.equal(result.code, 0);
  assert.match(result.stderr, /^savings: .*sessions\.json is not valid JSON/m);
  assert.equal(await fs.readFile(ledger, 'utf8'), '{not json');
});

test('record without a transcript path books an empty row and exits 0', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const result = await runWithStdin(['record'], JSON.stringify({ session_id: 's1' }), { CLAUDE_CONFIG_DIR: directory });
  assert.equal(result.code, 0, result.stderr);
  const session = (await readLedger(directory)).s1;
  assert.equal(session.transcript, null);
  assert.deepEqual(session.usageById, {});
});

test('the cost and duration the status line reports are never stored in the ledger', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const statusInput = { session_id: 's1', transcript_path: transcript, cost: { total_cost_usd: 1.23, total_duration_ms: 4000 } };
  const result = await runWithStdin(['statusline'], JSON.stringify(statusInput), { CLAUDE_CONFIG_DIR: configDirectory });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^exo /);
  const session = (await readLedger(configDirectory)).s1;
  for (const field of ['costUsd', 'durationMs', 'tokens', 'lines', 'linesByEntry']) {
    assert.equal(Object.hasOwn(session, field), false, field);
  }
});

test('a row whose transcript is gone gets an empty overhead and keeps its transcript path', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const gone = path.join(directory, 'gone.jsonl');
  await writeLedger(directory, { s9: { transcript: gone, overhead: null } });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  const session = (await readLedger(directory)).s9;
  assert.deepEqual(session.overhead, { version: OVERHEAD_VERSION, hookMs: 0, transcripts: {}, calls: {} });
  assert.equal(session.transcript, gone);
});

test('a switch under an EXO_SAVINGS override says the environment outranks it', async () => {
  const directory = await fixture();
  const result = await runWithStdin(['off'], '', { CLAUDE_CONFIG_DIR: directory, EXO_SAVINGS: 'on' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^EXO_SAVINGS=on in the environment outranks the switch\.$/m);
});
