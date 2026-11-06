import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { addLine, emptyRecord, formatReport, loadSessions, main, sessionRecord, splitWindows, windowSummary } from '../benchmarks/session-stats.mjs';
import { tempDir } from './harness.mjs';

const assistant = (blocks, timestamp = '2026-10-21T10:00:00Z') =>
  JSON.stringify({ type: 'assistant', timestamp, message: { content: blocks } });
const tool = (name, input = {}) => ({ type: 'tool_use', name, input });
const pick = (record, keys) => Object.fromEntries(keys.map((key) => [key, record[key]]));
const user = (text = 'do it', extra = {}) =>
  JSON.stringify({ type: 'user', timestamp: '2026-10-21T10:00:00Z', message: { content: text }, ...extra });
const turn = (timestamp, extra = {}) =>
  JSON.stringify({ type: 'assistant', timestamp, message: { id: extra.id, content: [], usage: extra.usage }, cwd: extra.cwd, entrypoint: extra.entrypoint });
const writeSession = (dir, name, lines) => fs.writeFileSync(path.join(dir, `${name}.jsonl`), `${lines.join('\n')}\n`);
const writeSubagents = (dir, name, subagents) => {
  fs.mkdirSync(path.join(dir, name, 'subagents'), { recursive: true });
  subagents.forEach((sub, index) => fs.writeFileSync(path.join(dir, name, 'subagents', `a${index}.jsonl`), `${sub}\n`));
};
const capture = async (run) => {
  const out = [];
  const err = [];
  const [log, error] = [console.log, console.error];
  console.log = (text) => out.push(text);
  console.error = (text) => err.push(text);
  try {
    return { status: await run(), out: out.join('\n'), err: err.join('\n') };
  } finally {
    [console.log, console.error] = [log, error];
  }
};

test('a line counts turns, tool calls, bash calls, dispatches and check runs', () => {
  const record = emptyRecord();
  addLine(record, assistant([tool('Bash', { command: 'npm run check' }), tool('Agent'), tool('Read')]));
  addLine(record, 'not json');
  assert.deepEqual(
    pick(record, ['assistantTurns', 'toolCalls', 'bashCalls', 'agentDispatches', 'checkRuns']),
    { assistantTurns: 1, toolCalls: 3, bashCalls: 1, agentDispatches: 1, checkRuns: 1 }
  );
  assert.equal(record.startedAt, '2026-10-21T10:00:00Z');
});

test('a session record adds its subagent transcripts', async () => {
  const dir = tempDir('session-stats-');
  fs.mkdirSync(path.join(dir, 's1', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 's1.jsonl'), `${assistant([tool('Bash', { command: 'ls' })])}\n`);
  fs.writeFileSync(path.join(dir, 's1', 'subagents', 'a.jsonl'), `${assistant([tool('Bash', { command: 'node --test x' })])}\n`);
  const record = await sessionRecord(path.join(dir, 's1.jsonl'));
  assert.equal(record.assistantTurns, 2);
  assert.equal(record.checkRuns, 1);
});

test('windows split by date and report median and mad', () => {
  const at = (startedAt, turns) => ({ ...emptyRecord(), startedAt, assistantTurns: turns });
  const windows = splitWindows([at('2026-10-01T00:00:00Z', 10), at('2026-10-02T00:00:00Z', 30), at('2026-10-21T00:00:00Z', 5)], {
    before: '2026-10-20',
    after: '2026-10-20'
  });
  assert.equal(windows.before.length, 2);
  assert.equal(windows.after.length, 1);
  const summary = windowSummary(windows.before);
  assert.deepEqual(summary.assistantTurns, { median: 20, mad: 10 });
  assert.match(formatReport({ before: summary }), /assistantTurns: median 20 mad 10/);
});

test('too few sessions in a window fails the run', async () => {
  const root = tempDir('session-stats-projects-');
  fs.mkdirSync(path.join(root, '-home-demo'));
  const status = await main(['--repo', 'demo', '--before', '2026-10-20', '--after', '2026-10-20', '--projects', root]);
  assert.equal(status, 1);
});

test('stub and headless benchmark sessions are skipped and counted', async () => {
  const root = tempDir('session-stats-skip-');
  const dir = path.join(root, '-home-demo');
  fs.mkdirSync(dir);
  const real = [user(), turn('2026-10-21T10:00:00Z'), turn('2026-10-21T10:01:00Z'), turn('2026-10-21T10:02:00Z')];
  writeSession(dir, 'real', real);
  writeSession(dir, 'stub', [user(), turn('2026-10-21T10:00:00Z')]);
  writeSession(dir, 'noprompt', [turn('2026-10-21T10:00:00Z'), turn('2026-10-21T10:01:00Z'), turn('2026-10-21T10:02:00Z')]);
  const bench = real.map((line) => ({ ...JSON.parse(line), entrypoint: 'sdk-cli', cwd: '/private/tmp/demo-probe-1' }));
  writeSession(dir, 'bench', bench.map((entry) => JSON.stringify(entry)));
  const { records, skipped } = await loadSessions(root, 'demo');
  assert.equal(records.length, 1);
  assert.deepEqual(skipped, { stub: 2, headless: 1 });
});

test('a headless sdk-cli session is skipped whatever its cwd', async () => {
  const root = tempDir('session-stats-headless-');
  const dir = path.join(root, '-home-demo');
  fs.mkdirSync(dir);
  const lines = [user(), turn('2026-10-21T10:00:00Z'), turn('2026-10-21T10:01:00Z'), turn('2026-10-21T10:02:00Z')];
  const headless = lines.map((line) => JSON.stringify({ ...JSON.parse(line), entrypoint: 'sdk-cli', cwd: '/home/me/demo' }));
  writeSession(dir, 'headless', headless);
  const { records, skipped } = await loadSessions(root, 'demo');
  assert.equal(records.length, 0);
  assert.deepEqual(skipped, { stub: 0, headless: 1 });
});

test('a session whose turns come from its subagents is not a stub', async () => {
  const root = tempDir('session-stats-sub-');
  const dir = path.join(root, '-home-demo');
  fs.mkdirSync(dir);
  const sub = [turn('2026-10-21T10:01:00Z'), turn('2026-10-21T10:02:00Z')].join('\n');
  writeSession(dir, 's1', [user(), turn('2026-10-21T10:00:00Z')]);
  writeSubagents(dir, 's1', [sub]);
  const { records, skipped } = await loadSessions(root, 'demo');
  assert.equal(records.length, 1);
  assert.equal(records[0].assistantTurns, 3);
  assert.equal(skipped.stub, 0);
});

test('a session in another repo with a longer name is not counted', async () => {
  const root = tempDir('session-stats-repos-');
  const dir = path.join(root, '-home-demo-extra');
  fs.mkdirSync(dir);
  const lines = [user(), turn('2026-10-21T10:00:00Z', { cwd: '/home/demo-extra' }), turn('2026-10-21T10:01:00Z'), turn('2026-10-21T10:02:00Z')];
  writeSession(dir, 's1', lines);
  assert.equal((await loadSessions(root, 'demo')).records.length, 0);
  assert.equal((await loadSessions(root, 'demo-extra')).records.length, 1);
});

test('active minutes cut gaps over five minutes and tokens count once per message', async () => {
  const dir = tempDir('session-stats-active-');
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 1 };
  const lines = [
    user(),
    turn('2026-10-21T10:00:00Z', { id: 'm1', usage }),
    turn('2026-10-21T10:00:00Z', { id: 'm1', usage }),
    turn('2026-10-21T10:03:00Z', { id: 'm2', usage }),
    turn('2026-10-21T10:30:00Z', { id: 'm3', usage }),
    turn('2026-10-21T10:32:00Z', { id: 'm4', usage })
  ];
  writeSession(dir, 's1', lines);
  const record = await sessionRecord(path.join(dir, 's1.jsonl'));
  assert.equal(record.activeMinutes, 5);
  assert.equal(record.totalTokens, 4 * 116);
});

test('dispatches split by subagent type with review and fix counts', () => {
  const record = emptyRecord();
  const dispatch = (type) => tool('Agent', { subagent_type: type });
  addLine(record, assistant([dispatch('exo:review-branch'), dispatch('exo:fix-review'), dispatch('exo:fix-review'), tool('Task')]));
  assert.deepEqual(record.dispatchTypes, { 'exo:review-branch': 1, 'exo:fix-review': 2, 'general-purpose': 1 });
  assert.equal(record.reviewBranchDispatches, 1);
  assert.equal(record.fixReviewDispatches, 2);
  const summary = windowSummary([record, emptyRecord()]);
  assert.deepEqual(summary.dispatchTypes['exo:fix-review'], { median: 1, mad: 1 });
});

test('a short window is named while the other window is still printed', async () => {
  const root = tempDir('session-stats-short-');
  const dir = path.join(root, '-home-demo');
  fs.mkdirSync(dir);
  const at = (day) => [user(), turn(`2026-10-${day}T10:00:00Z`), turn(`2026-10-${day}T10:01:00Z`), turn(`2026-10-${day}T10:02:00Z`)];
  writeSession(dir, 'a', at('21'));
  writeSession(dir, 'b', at('22'));
  const args = ['--repo', 'demo', '--before', '2026-10-20', '--after', '2026-10-20', '--min-sessions', '2', '--projects', root];
  const { status, out, err } = await capture(() => main(args));
  assert.equal(status, 1);
  assert.match(out, /after: 2 sessions/);
  assert.doesNotMatch(out, /before:/);
  assert.match(err, /before: 0 sessions, need at least 2/);
});

test('lines sharing a message id count one turn and keep every tool call', () => {
  const record = emptyRecord();
  const seen = new Set();
  const line = (block) => JSON.stringify({ type: 'assistant', message: { id: 'm1', content: [block] } });
  addLine(record, line({ type: 'text', text: 'hi' }), seen);
  addLine(record, line(tool('Bash', {})), seen);
  assert.deepEqual(pick(record, ['assistantTurns', 'toolCalls']), { assistantTurns: 1, toolCalls: 1 });
});

test('window medians print without float noise', () => {
  const records = [0.81, 0.8, 0.82, 0.81].map((activeMinutes) => ({ ...emptyRecord(), activeMinutes: activeMinutes * 3 }));
  assert.equal(windowSummary(records).activeMinutes.median, 2.43);
});
