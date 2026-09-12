// The savings ledger reads the transcript the harness writes: one line per
// content block sharing a message id, streaming repeats with a growing output
// count, and tool results carrying structured patches. These fixtures pin the
// shape observed on 2026-09-11; a format change shows up here first. Ratios
// are pinned in config.json, so a published benchmark run moves no figure.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { OVERHEAD_VERSION } from '../skills/savings/scripts/overhead.mjs';
import { fixture, run } from './harness.mjs';

const SAVINGS = fileURLToPath(new URL('../skills/savings/scripts/savings.mjs', import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
// Cuts that save the whole actual in lines, a quarter in tokens, and a third in
// cost and time. None may equal its FIRST_LOAD_RATIOS value in savings.mjs,
// which loadConfig reads as unedited and replaces with the published ratio.
const TEST_RATIOS = { lines: 0.5, tokens: 0.2, cost: 0.25, time: 0.25 };

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
  { type: 'assistant', uuid: 'a1', timestamp: '2026-09-11T10:00:00.000Z', attributionSkill: 'exo:right-sizing',
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

async function writeConfig(configDirectory, config = { ratios: TEST_RATIOS }) {
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

// A ledger row as the current version books it, its overhead held as usage counts in one transcript.
function bookedRow(fields, overheadCounts = {}, overheadHookMs = 0) {
  const counts = { input: 0, cacheRead: 0, cache5m: 0, cache1h: 0, output: 0, ...overheadCounts };
  const transcripts = { '/t.jsonl': { model: 'claude-haiku-4-5', counts } };
  return { overhead: { version: OVERHEAD_VERSION, hookMs: overheadHookMs, transcripts, calls: {}, refusals: {} }, ...fields };
}

function call(id, timestamp, model, counts) {
  const usageBlock = { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: counts.cache1h + counts.cache5m, output_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: counts.cache5m, ephemeral_1h_input_tokens: counts.cache1h } };
  return { type: 'assistant', uuid: `${id}-u`, timestamp, message: { id, model, usage: usageBlock, content: [{ type: 'text', text: 'ok' }] } };
}

test('record sums usage once per message id, weights the cache, and counts patched lines', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  const first = await runWithStdin(['record'], JSON.stringify({ session_id: 's1', transcript_path: transcript }), env);
  assert.equal(first.code, 0, first.stderr);
  const session = (await readLedger(configDirectory)).s1;
  assert.deepEqual(session.tokens, {
    input: 15, cacheRead: 2000, cache5m: 200, cache1h: 1000, output: 507, raw: 3722, weightedInput: 2465
  });
  assert.deepEqual(session.lines, { added: 10, removed: 4, processAdded: 0 });
  assert.equal(session.rightSized, true);
  assert.equal(session.model, 'claude-fable-5-1');
  assert.equal(session.transcript, transcript);
  assert.equal(session.started, '2026-09-11T10:00:00.000Z');
  assert.equal(session.updated, '2026-09-11T10:03:00.000Z');
  assert.deepEqual(session.guard, { capped: 0, duplicates: 0, hookMs: 0, refusals: {} });
});

test('record is idempotent across runs and appended lines are picked up', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  const hookInput = JSON.stringify({ session_id: 's1', transcript_path: transcript });
  await runWithStdin(['record'], hookInput, env);
  await runWithStdin(['record'], hookInput, env);
  let session = (await readLedger(configDirectory)).s1;
  assert.deepEqual(session.lines, { added: 10, removed: 4, processAdded: 0 });
  assert.equal(session.tokens.output, 507);

  const appended = { type: 'assistant', uuid: 'a9', timestamp: '2026-09-11T10:09:00.000Z',
    message: { id: 'msg_C', model: 'claude-fable-5-1', usage: usage(50), content: [{ type: 'text' }] } };
  await fs.appendFile(transcript, `${JSON.stringify(appended)}\n`);
  await runWithStdin(['record'], hookInput, env);
  session = (await readLedger(configDirectory)).s1;
  assert.equal(session.tokens.output, 557);
  assert.equal(session.updated, '2026-09-11T10:09:00.000Z');
});

test('a session that wrote product code saves actual × r / (1 − r), with no overhead taken off again', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  const statusInput = JSON.stringify({
    session_id: 's1', transcript_path: transcript, cwd: '/shop/src',
    workspace: { current_dir: '/shop/src', project_dir: '/shop' },
    cost: { total_cost_usd: 1.5, total_duration_ms: 600000, total_lines_added: 12, total_lines_removed: 4 }
  });
  const result = await runWithStdin(['statusline'], statusInput, env);
  assert.equal(result.code, 0, result.stderr);
  // lines 10 × 1, tokens (2465 + 507) × 1/4 = 743, cost $1.50 × 1/3 = $0.50, time 10 min × 1/3 = 3.3 min
  assert.equal(result.stdout, 'saved ≈ 10 LOC · 743 tok · $0.50 · 3m');
  const session = (await readLedger(configDirectory)).s1;
  assert.equal(session.costUsd, 1.5);
  assert.equal(session.durationMs, 600000);
  assert.equal(session.project, '/shop');
});

test('a session without product code saves minus its overhead, and a loss shows in every figure', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const env = { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' };
  // The covered row's overhead is inside its ratio, so its 99,999 cache writes never come off.
  const covered = bookedRow({ lines: { added: 100, removed: 0, processAdded: 0 }, tokens: { weightedInput: 7000, output: 1000 }, costUsd: 1, durationMs: 600000 },
    { cache1h: 99999 });
  const guard = { capped: 0, duplicates: 0, hookMs: 30000, refusals: {} };
  const uncovered = bookedRow({ project: directory, lines: { added: 0, removed: 0, processAdded: 20 }, tokens: { weightedInput: 0, output: 0 }, guard },
    { cache1h: 5000 }, 30000);
  await writeLedger(directory, { s1: covered, s2: uncovered });
  // lines 100 - 20; tokens 8000 / 4 - 2 × 5000; cost $1 / 3 - 5000 × $2 per million; time 200 s - 60 s - 0.2 s of processing
  assert.equal((await runWithStdin(['statusline'], '{}', env)).stdout, 'saved ≈ 80 LOC · -8.0k tok · $0.32 · 2m');
  await writeLedger(directory, { s2: uncovered });
  assert.equal((await runWithStdin(['statusline'], '{}', env)).stdout, 'saved ≈ -20 LOC · -10k tok · -$0.01 · -1m');
  const panel = (await run(SAVINGS, ['report'], { env, cwd: directory })).stdout;
  assert.match(panel, /^\| cost at API price \| -\$0\.01 \| -\$0\.01 \|$/m);
  assert.match(panel, /^\| lines \| -20 \| -20 \|$/m);
  assert.match(panel, /^\| tokens \| -10k \| -10k \|$/m);
  assert.match(panel, /^\| time \| -1m \| -1m \|$/m);
});

test("overhead is priced per transcript at that transcript's model, and an unlisted model leaves the cost unknown", async () => {
  const listingLine = `- exo:${'x'.repeat(8080)}`;
  const bodyPrefix = `Base directory for this skill: ${REPOSITORY_ROOT}skills/debug\n`;
  const skillBody = bodyPrefix + 'y'.repeat(8086 - bodyPrefix.length);
  const outputs = [];
  for (const mainModel of ['claude-fable-5-1', 'claude-unlisted-9']) {
    const main = [
      { type: 'attachment', timestamp: '2026-09-11T10:00:00.000Z', attachment: { type: 'skill_listing', content: listingLine } },
      call('msg_m1', '2026-09-11T10:00:01.000Z', mainModel, { cache1h: 5000, cache5m: 0 }),
      call('msg_m2', '2026-09-11T10:00:02.000Z', mainModel, { cache1h: 5000, cache5m: 0 })
    ];
    const delegate = [
      { type: 'user', isMeta: true, timestamp: '2026-09-11T10:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: skillBody }] } },
      call('msg_d1', '2026-09-11T10:00:01.500Z', 'claude-sonnet-5', { cache1h: 0, cache5m: 5000 }),
      call('msg_d2', '2026-09-11T10:00:01.700Z', 'claude-sonnet-5', { cache1h: 0, cache5m: 5000 })
    ];
    const { configDirectory, transcript } = await transcriptFixture(main, delegate);
    const env = { CLAUDE_CONFIG_DIR: configDirectory };
    await runWithStdin(['record'], JSON.stringify({ session_id: 's1', transcript_path: transcript }), env);
    outputs.push((await runWithStdin(['statusline'], '{}', env)).stdout);
  }
  // 8,086 characters are 2,000 tokens each. Fable: written at $20 and read at $0.25; Sonnet: written at $2.50 and read
  // at $0.20, per million. Tokens: 2 × 2000 + 0.1 × 2000 + 1.25 × 2000 + 0.1 × 2000 = 6900.
  assert.deepEqual(outputs, ['saved ≈ 0 LOC · -6.9k tok · -$0.05 · 0m', 'saved ≈ 0 LOC · -6.9k tok · - · 0m']);
});

test('lines written into exo process files come off the lines saved', async () => {
  const lines = [
    { type: 'user', uuid: 'w1', timestamp: '2026-09-11T10:00:01.000Z',
      toolUseResult: { type: 'create', filePath: '/repo/docs/specs/brief.md', content: Array.from({ length: 30 }, () => 'b').join('\n'), originalFile: null, structuredPatch: [] } },
    { type: 'user', uuid: 'w2', timestamp: '2026-09-11T10:00:02.000Z',
      toolUseResult: { type: 'create', filePath: '/repo/src/a.js', content: Array.from({ length: 10 }, () => 'a').join('\n'), originalFile: null, structuredPatch: [] } }
  ];
  const { configDirectory, transcript } = await transcriptFixture(lines, []);
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  await runWithStdin(['record'], JSON.stringify({ session_id: 's1', transcript_path: transcript }), env);
  assert.deepEqual((await readLedger(configDirectory)).s1.lines, { added: 10, removed: 0, processAdded: 30 });
  assert.match((await runWithStdin(['statusline'], '{}', env)).stdout, /^saved ≈ -20 LOC · /);
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
  assert.deepEqual(session.lines, { added: 10, removed: 4, processAdded: 0 });
});

test('config ratios equal to the ones 0.1.x wrote on first load give way to the published ratios; edited ones apply', async () => {
  const configs = {
    readGuardOnly: { readGuard: false },
    firstLoad: { ratios: { lines: 0.54, tokens: 0.22, cost: 0.2, time: 0.27 } },
    edited: { ratios: TEST_RATIOS },
    linesEditedAfterFirstLoad: { ratios: { lines: 0.5, tokens: 0.22, cost: 0.2, time: 0.27 } },
    linesOnly: { ratios: { lines: 0.5 } }
  };
  const outputs = {};
  for (const [name, config] of Object.entries(configs)) {
    const { configDirectory, transcript } = await transcriptFixture();
    await writeConfig(configDirectory, config);
    const statusInput = JSON.stringify({ session_id: 's1', transcript_path: transcript, cost: { total_cost_usd: 1.5, total_duration_ms: 600000 } });
    outputs[name] = (await runWithStdin(['statusline'], statusInput, { CLAUDE_CONFIG_DIR: configDirectory })).stdout;
  }
  assert.equal(outputs.firstLoad, outputs.readGuardOnly);
  assert.equal(outputs.edited, 'saved ≈ 10 LOC · 743 tok · $0.50 · 3m');
  assert.equal(outputs.linesEditedAfterFirstLoad, outputs.linesOnly);
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

test('report shows the switch state and the saving for the current project beside all projects', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const project = path.join(configDirectory, 'shop');
  const nested = path.join(project, 'src');
  await fs.mkdir(nested, { recursive: true });
  const env = { CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_PROJECT_DIR: '' };
  await runWithStdin(['record'], JSON.stringify({ session_id: 's1', transcript_path: transcript, cwd: project }), env);
  await runWithStdin(['record'], JSON.stringify({ session_id: 's2', transcript_path: transcript, cwd: '/elsewhere' }), env);
  const result = await run(SAVINGS, ['report'], { env, cwd: nested });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^\*\*✻ exo savings\*\* · ● on$/m);
  assert.match(result.stdout, /^\| ≈ saved \| in shop \| everywhere \|$/m);
  // Priced per model: Fable 25,600 + Sonnet 4,580 per million = $0.0302 a session, a third of it saved.
  assert.match(result.stdout, /^\| cost at API price \| \$0\.01 \| \$0\.02 \|$/m);
  assert.match(result.stdout, /^\| lines \| 10 \| 20 \|$/m);
  assert.match(result.stdout, /^\| tokens \| 743 \| 1\.5k \|$/m);
  assert.match(result.stdout, /^\| time \| 1m \| 2m \|$/m);
  assert.match(result.stdout, /^> Turn off with `\/exo:savings off`\.$/m);
  // Both sessions started on one day, too few for a trend.
  assert.doesNotMatch(result.stdout, /last 30 days/);
});

test('report draws the 30-day trend of the net cost saved, a losing day as a minus', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  // Local noon on each day, so a daylight-saving change cannot move a session across midnight.
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const daysAgo = (count) => {
    const day = new Date(today);
    day.setDate(today.getDate() - count);
    return day.toISOString();
  };
  const covered = (started) => bookedRow({ started, updated: started, costUsd: 1, lines: { added: 10, removed: 0, processAdded: 0 } });
  const losing = bookedRow({ started: daysAgo(2), updated: daysAgo(2), lines: { added: 0, removed: 0, processAdded: 0 } }, { cache1h: 5000 });
  await writeLedger(directory, { s1: covered(daysAgo(1)), s2: covered(daysAgo(0)), s3: losing });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^\| last 30 days \| `[▁-█-]{30}` \| `▁{27}-██` \|$/m);
});

// Local noon on the day the given number of days back, so a daylight-saving change cannot move it across midnight.
function localNoonDaysAgo(count) {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - count);
  return day.toISOString();
}

// A session that wrote product code and cost $3.00, so the test ratios save $1.00 of it.
function dollarSavedRow(daysAgo) {
  const started = localNoonDaysAgo(daysAgo);
  return bookedRow({ started, updated: started, costUsd: 3, lines: { added: 10, removed: 0, processAdded: 0 } });
}

test('report opens on the total saved, today\'s gain, the streak and the bar to the next milestone', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  await writeLedger(directory, { s1: dollarSavedRow(2), s2: dollarSavedRow(1), s3: dollarSavedRow(0) });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^### ≈ \$3\.00 saved$/m);
  assert.match(result.stdout, /^`█{12}░{8}` \*\*60%\*\* to \$5 · \+\$1\.00 today · 🔥 3-day streak$/m);
});

test('report keeps a streak that ended yesterday alive and prints no gain for a quiet today', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  await writeLedger(directory, { s1: dollarSavedRow(2), s2: dollarSavedRow(1) });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^`█{8}░{12}` \*\*40%\*\* to \$5 · 🔥 2-day streak$/m);
  assert.doesNotMatch(result.stdout, /today/);
});

test('report ends the streak on a day that loses', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const started = localNoonDaysAgo(0);
  const losing = bookedRow({ started, updated: started, lines: { added: 0, removed: 0, processAdded: 0 } }, { cache1h: 5000 });
  await writeLedger(directory, { s1: dollarSavedRow(2), s2: dollarSavedRow(1), s3: losing });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, / · -\$\d+\.\d{2} today$/m);
  assert.doesNotMatch(result.stdout, /streak/);
});

test('report draws no milestone bar and no streak while the total is a loss', async () => {
  const directory = await fixture();
  await writeConfig(directory);
  const started = localNoonDaysAgo(0);
  const losing = bookedRow({ started, updated: started, lines: { added: 0, removed: 0, processAdded: 0 } }, { cache1h: 5000 });
  await writeLedger(directory, { s1: losing });
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^### ≈ -\$\d+\.\d{2} saved$/m);
  assert.doesNotMatch(result.stdout, /streak|\*\*\d+%\*\* to \$/);
});

test('an unknown command fails with usage', async () => {
  const result = await runWithStdin(['bogus'], '', {});
  assert.equal(result.code, 1);
  assert.match(result.stderr, /usage: savings\.mjs record\|statusline\|report/);
});

test('report exits non-zero and surfaces the error on a ledger fault', async () => {
  const directory = await fixture();
  const configFile = path.join(directory, 'config-is-a-file');
  await fs.writeFile(configFile, 'not a directory');
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: configFile });
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
  assert.equal((await runWithStdin(['off'], '', env)).stdout, 'exo savings off; right-sizing follows at the next session start\n');
  assert.equal(JSON.parse(await fs.readFile(configFile, 'utf8')).enabled, false);
  assert.equal((await runWithStdin(['status'], '', env)).stdout, 'off\n');
  const panel = (await runWithStdin(['report'], '', env)).stdout;
  assert.match(panel, /· ○ off$/m);
  assert.match(panel, /^> Turn on with `\/exo:savings on`\.$/m);
  assert.equal((await runWithStdin(['on'], '', env)).stdout, 'exo savings on; right-sizing follows at the next session start\n');
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  assert.equal(config.enabled, true);
  assert.equal(config.ratios, undefined);
});
