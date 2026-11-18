import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { entryOf } from '../skills/learn/scripts/corrections.mjs';

const script = fileURLToPath(new URL('../skills/learn/scripts/corrections.mjs', import.meta.url));

function fixture() {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-corrections-'));
  const project = path.join(fs.realpathSync(os.tmpdir()), 'learn.corrections_x', 'app');
  fs.mkdirSync(project, { recursive: true });
  const name = fs.realpathSync(project).replace(/[^A-Za-z0-9]/g, '-');
  const folder = path.join(config, 'projects', name);
  fs.mkdirSync(folder, { recursive: true });
  const ledger = path.join(config, 'exo', 'learn', `${name}.jsonl`);
  return { config, project, folder, ledger };
}

function verdictsPath({ ledger }) {
  return ledger.replace(/\.jsonl$/, '.verdicts.jsonl');
}

function writeRows(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
}

function writeLedger(env, rows) {
  const isEntry = (row) => row.text !== undefined && row.verdict === undefined;
  for (const row of rows.filter(isEntry)) {
    const line = JSON.stringify({ type: 'user', timestamp: `${row.date}T10:00:00.000Z`, message: { content: row.text } });
    fs.appendFileSync(path.join(env.folder, `${row.session}.jsonl`), `${line}\n`);
  }
  writeRows(env.ledger, rows.filter((row) => row.verdict === undefined).map((row) => (isEntry(row) ? entryOf(row) : row)));
  const verdicts = rows.filter((row) => row.verdict !== undefined);
  if (verdicts.length > 0) writeRows(verdictsPath(env), verdicts);
}

function fillers(count) {
  return Array.from({ length: count }, (_, index) => ({ date: '2026-01-01', session: `filler-${index}`, text: `zq${index}a zq${index}b zq${index}c` }));
}

function readLedger({ ledger }) {
  return fs.readFileSync(ledger, 'utf8').split('\n').filter((row) => row !== '').map((row) => JSON.parse(row));
}

function inheritedEnv() {
  const { CLAUDE_PROJECT_DIR: _project, ...inherited } = process.env;
  return inherited;
}

function run(env, args, input, extra = {}) {
  return spawnSync('node', [script, ...args], { encoding: 'utf8', input, env: { ...inheritedEnv(), CLAUDE_CONFIG_DIR: env.config, ...extra } });
}

function hook(env, session, prompt, cwd = env.project, extra = {}) {
  const result = run(env, ['hook'], JSON.stringify({ session_id: session, prompt, cwd }), extra);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const REPEAT = 'rename variable totalcount everywhere please';
const EARLIER = { date: '2026-01-02', session: 'earlier', text: 'please rename variable totalcount everywhere quickly' };
const OLDER = { ...EARLIER, date: '2026-01-01', session: 'older' };

test('a turn Claude Code starts itself leaves no ledger row and prints nothing', () => {
  const env = fixture();
  const output = hook(env, 'now', `<task-notification>\n${REPEAT}</task-notification>`);
  assert.equal(output, '');
  assert.equal(fs.existsSync(env.ledger), false);
});

test('a repeat from another session prints the line once; a second repeat of that cluster prints nothing', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER, OLDER, { seen: 'now' }, { seen: 'later' }]);
  assert.equal(hook(env, 'now', REPEAT), `exo: you asked something like this on 2026-01-02: "${EARLIER.text}". exo:learn turns a repeated correction or wish into a check or lesson (id ${entryOf(EARLIER).id}).\n`);
  assert.equal(hook(env, 'later', REPEAT), '');
});

test('a flag hides only prompts similar to the flagged prompt, not to the entry it matched', () => {
  const env = fixture();
  const held = { date: '2026-01-02', session: 'earlier', text: 'alpha bravo charlie delta echo foxtrot golf hotel' };
  writeLedger(env, [...fillers(60), held, { ...held, date: '2026-01-01', session: 'older' }, { seen: 'a' }, { seen: 'b' }]);
  assert.equal(hook(env, 'a', 'alpha bravo charlie delta zuluxx').includes('on 2026-01-02'), true);
  assert.equal(hook(env, 'b', 'echo foxtrot golf hotel yankee').includes('on 2026-01-02'), true);
});

test('a prompt typed in a subfolder is keyed by the project root', () => {
  const env = fixture();
  const subfolder = path.join(env.project, 'packages', 'web');
  fs.mkdirSync(subfolder, { recursive: true });
  writeLedger(env, [...fillers(60), OLDER, { seen: 'first' }, { seen: 'second' }]);
  assert.equal(hook(env, 'first', REPEAT), '');
  const line = JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), message: { content: REPEAT } });
  fs.writeFileSync(path.join(env.folder, 'first.jsonl'), `${line}\n`);
  const output = hook(env, 'second', REPEAT, subfolder, { CLAUDE_PROJECT_DIR: env.project });
  assert.match(output, /you asked something like this on /);
});

const KEPT_LINE = `exo: this prompt shares words with a lesson you kept (id ${entryOf(EARLIER).id}); exo:learn can strengthen it\n`;
const keptRow = { verdict: 'kept', ids: [entryOf(EARLIER).id], words: entryOf(EARLIER).words };

test('a kept lesson is flagged once per keep, and a new keep re-arms it', () => {
  const env = fixture();
  writeLedger(env, [...fillers(100), EARLIER, { seen: 'one' }, { seen: 'two' }, { seen: 'three' }, keptRow]);
  assert.equal(hook(env, 'one', REPEAT), KEPT_LINE);
  assert.equal(hook(env, 'two', REPEAT), '');
  assert.equal(run(env, ['keep', entryOf(EARLIER).id, '--cwd', env.project]).status, 0);
  assert.equal(hook(env, 'three', REPEAT), KEPT_LINE);
});

test('a cluster kept and then rejected stays silent on a repeat', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER, { seen: 'one' }, keptRow]);
  assert.equal(run(env, ['reject', entryOf(EARLIER).id, '--cwd', env.project]).status, 0);
  assert.equal(hook(env, 'one', REPEAT), '');
});

test('a cluster flagged before its keep still prints the kept-repeat line', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER, { flagged: entryOf(EARLIER).words }, { seen: 'one' }, keptRow]);
  assert.equal(hook(env, 'one', REPEAT), KEPT_LINE);
});

test('a keep after a reject takes the cluster back, the newest matching verdict wins', () => {
  const env = fixture();
  const rejectedRow = { ...keptRow, verdict: 'rejected' };
  writeLedger(env, [...fillers(60), EARLIER, { seen: 'one' }, rejectedRow]);
  assert.equal(hook(env, 'one', REPEAT), '');
  assert.equal(run(env, ['keep', entryOf(EARLIER).id, '--cwd', env.project]).status, 0);
  assert.equal(hook(env, 'one', REPEAT), KEPT_LINE);
});

test('a kept row from an old cache with words and no ids is flagged once and can be kept again', () => {
  const env = fixture();
  writeLedger(env, [...fillers(100), EARLIER, { seen: 'one' }, { seen: 'two' }, { seen: 'three' }, { verdict: 'kept', words: entryOf(EARLIER).words }]);
  assert.equal(hook(env, 'one', REPEAT), KEPT_LINE);
  assert.equal(hook(env, 'two', REPEAT), '');
  assert.equal(run(env, ['keep', entryOf(EARLIER).id, '--cwd', env.project]).status, 0);
  assert.equal(hook(env, 'three', REPEAT), KEPT_LINE);
});

test('a prompt similar only to an earlier entry of a kept cluster prints the kept-repeat line', () => {
  const env = fixture();
  const kept = { date: '2026-01-02', session: 's1', text: 'alpha bravo charlie delta echo foxtrot' };
  const middle = { date: '2026-01-03', session: 's2', text: 'charlie delta echo foxtrot golf hotel' };
  const row = { verdict: 'kept', ids: [entryOf(kept).id], words: entryOf(kept).words };
  writeLedger(env, [...fillers(100), kept, middle, { seen: 's3' }, row]);
  assert.equal(hook(env, 's3', 'echo foxtrot golf hotel india juliet'), `exo: this prompt shares words with a lesson you kept (id ${entryOf(kept).id}); exo:learn can strengthen it\n`);
});

test('a same-session repeat prints nothing', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER, { seen: 'earlier' }]);
  assert.equal(hook(env, 'earlier', REPEAT), '');
});

test('three similar entries in one session are no candidate and raise no hook line', () => {
  const env = fixture();
  const same = { ...EARLIER, session: 'solo' };
  writeLedger(env, [...fillers(100), same, { ...same }, { ...same }, { seen: 'now' }]);
  assert.equal(run(env, ['candidates', '--cwd', env.project]).stdout, '');
  assert.equal(hook(env, 'now', REPEAT), '');
});

test('a first prompt is recorded but never flagged', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER]);
  fs.writeFileSync(path.join(env.folder, 'fresh.jsonl'), transcriptLine(REPEAT, 0));
  assert.equal(hook(env, 'fresh', REPEAT), '');
  const rows = readLedger(env);
  assert.deepEqual(rows.slice(-2), [{ seen: 'fresh' }, entryOf({ date: new Date().toISOString().slice(0, 10), session: 'fresh', text: REPEAT })]);
});

test('a prompt with fewer than 4 counted words is not flagged', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), { ...EARLIER, text: 'rename totalcount please' }, { seen: 'now' }]);
  assert.equal(hook(env, 'now', 'rename totalcount please'), '');
});

test('a repeat in a non-Latin script is found the same way', () => {
  for (const [text, again] of [
    ['テストを実行して結果を確認してください', 'テストを実行して結果を確認してください'],
    ['μετονόμασε τη μεταβλητή παντού παρακαλώ', 'παρακαλώ μετονόμασε τη μεταβλητή παντού']
  ]) {
    const env = fixture();
    writeLedger(env, [...fillers(60), { date: '2026-02-03', session: 'earlier', text }, { date: '2026-02-02', session: 'older', text }, { seen: 'now' }]);
    assert.equal(hook(env, 'now', again).includes('on 2026-02-03'), true, text);
  }
});

test('a word used in most entries does not count', () => {
  const env = fixture();
  const common = Array.from({ length: 60 }, (_, index) => ({ date: '2026-01-01', session: `s${index}`, text: `please also kindly zq${index}x zq${index}y` }));
  writeLedger(env, [...common, { seen: 'now' }]);
  assert.equal(hook(env, 'now', 'please also kindly zqnewx zqnewy'), '');
});

function sessionStart(env, session) {
  const result = run(env, ['session-start'], JSON.stringify({ session_id: session, cwd: env.project, hook_event_name: 'SessionStart', source: 'startup' }));
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('the session-start candidates line comes from the count file, shows once per count and never on a prompt', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER]);
  fs.writeFileSync(`${env.ledger}.count`, JSON.stringify({ count: 2, printed: 0 }));
  const line = 'Exo found 2 new memories; /exo:learn lists them.';
  assert.deepEqual(JSON.parse(sessionStart(env, 'now')), { systemMessage: line, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: line } });
  assert.equal(sessionStart(env, 'next'), '');
  fs.writeFileSync(`${env.ledger}.count`, JSON.stringify({ count: 3, printed: 2 }));
  assert.equal(hook(env, 'now', 'hello'), '');
});

test('a hook that fails reports on stderr and still exits 0', () => {
  const result = run(fixture(), ['hook'], 'not json');
  assert.equal(result.status, 0);
  assert.notEqual(result.stderr, '');
});

test('candidates and the new-memories count need 3 sessions, and a third session makes the cluster one', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER, { ...EARLIER, session: 'other' }]);
  const result = run(env, ['candidates', '--cwd', env.project]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(run(env, ['recount', '--cwd', env.project]).status, 0);
  assert.equal(countOf(env), 0);
  writeLedger(env, [...fillers(60), EARLIER, { ...EARLIER, session: 'other' }, OLDER]);
  assert.match(run(env, ['candidates', '--cwd', env.project]).stdout, /\(3 sessions, 2026-01-01 to 2026-01-02\)/);
  assert.equal(run(env, ['recount', '--cwd', env.project]).status, 0);
  assert.equal(countOf(env), 1);
});

test('a repeat matching one other session prints no line; matching two prints it', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER, { seen: 'now' }]);
  assert.equal(hook(env, 'now', REPEAT), '');
  writeLedger(env, [...fillers(60), EARLIER, OLDER, { seen: 'again' }]);
  assert.match(hook(env, 'again', REPEAT), /you asked something like this on 2026-01-02/);
});

const pair = (text, date) => [{ date: '2026-01-01', session: 'a', text }, { date: '2026-01-02', session: 'b', text }, { date, session: 'c', text }];
const idOf = (row) => entryOf(row).id;
const countOf = (env) => JSON.parse(fs.readFileSync(`${env.ledger}.count`, 'utf8')).count;

test('candidates ranks by session count then newest date and shows the medoid text', () => {
  const env = fixture();
  const triple = [
    { date: '2026-01-01', session: 't1', text: 'alpha bravo charlie delta echo' },
    { date: '2026-02-01', session: 't2', text: 'alpha bravo charlie xray yankee' },
    { date: '2026-03-01', session: 't3', text: 'delta echo charlie zulu whiskey' },
    { date: '2026-03-02', session: 't4', text: 'alpha bravo charlie delta echo' }
  ];
  writeLedger(env, [...fillers(100), ...pair('foxtrot golf hotel india juliet', '2026-06-01'), ...triple]);
  assert.equal(run(env, ['candidates', '--cwd', env.project]).stdout, `${idOf(triple[0])} "alpha bravo charlie delta echo" (4 sessions, 2026-01-01 to 2026-03-02)\n${idOf(pair('foxtrot golf hotel india juliet', '')[0])} "foxtrot golf hotel india juliet" (3 sessions, 2026-01-01 to 2026-06-01)\n`);
});

test('keep and reject record every member id and hide the cluster', () => {
  const env = fixture();
  const [first, second] = [pair('alpha bravo charlie delta echo', '2026-03-01'), pair('foxtrot golf hotel india juliet', '2026-02-01')];
  writeLedger(env, [...fillers(60), ...first, ...second]);
  const kept = run(env, ['keep', idOf(second[0]), '--cwd', env.project]);
  assert.equal(kept.status, 0, kept.stderr);
  assert.equal(countOf(env), 1);
  assert.equal(run(env, ['reject', idOf(first[0]), '--cwd', env.project]).status, 0);
  assert.deepEqual(fs.readFileSync(verdictsPath(env), 'utf8').trim().split('\n').map((row) => JSON.parse(row)), [
    { verdict: 'kept', ids: second.map(idOf), words: entryOf(second[0]).words },
    { verdict: 'rejected', ids: first.map(idOf), words: entryOf(first[0]).words }
  ]);
  assert.equal(run(env, ['candidates', '--cwd', env.project]).stdout, '');
  assert.equal(countOf(env), 0);
});

test('a rejected cluster stays hidden when a similar entry arrives from another session', () => {
  const env = fixture();
  const rows = pair('alpha bravo charlie delta echo', '2026-03-01');
  writeLedger(env, [...fillers(60), ...rows]);
  assert.equal(run(env, ['reject', idOf(rows[0]), '--cwd', env.project]).status, 0);
  fs.appendFileSync(env.ledger, `${JSON.stringify(entryOf({ date: '2026-04-01', session: 'c', text: 'alpha bravo charlie delta echo' }))}\n`);
  assert.equal(run(env, ['candidates', '--cwd', env.project]).stdout, '');
});

test('keep and reject exit 2 without ids or on an unknown id, and reject takes back a kept id', () => {
  const env = fixture();
  const rows = pair('alpha bravo charlie delta echo', '2026-03-01');
  writeLedger(env, [...fillers(60), ...rows]);
  assert.equal(run(env, ['keep', '--cwd', env.project]).status, 2);
  const unknown = run(env, ['reject', 'nosuchid', '--cwd', env.project]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /nosuchid/);
  assert.equal(run(env, ['keep', idOf(rows[0]), '--cwd', env.project]).status, 0);
  assert.equal(run(env, ['reject', idOf(rows[0]), '--cwd', env.project]).status, 0);
});

test('keep from a subfolder reads the ledger of CLAUDE_PROJECT_DIR', () => {
  const env = fixture();
  const subfolder = path.join(env.project, 'sub');
  fs.mkdirSync(subfolder, { recursive: true });
  const entries = pair('alpha bravo charlie delta echo', '2026-03-01');
  writeLedger(env, [...fillers(60), ...entries]);
  const result = spawnSync('node', [script, 'keep', idOf(entries[0])], { encoding: 'utf8', cwd: subfolder, env: { ...process.env, CLAUDE_CONFIG_DIR: env.config, CLAUDE_PROJECT_DIR: env.project } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /kept/);
});

test('keep accepts any member id and decides the whole cluster', () => {
  const env = fixture();
  const rows = pair('alpha bravo charlie delta echo', '2026-03-01');
  writeLedger(env, [...fillers(60), ...rows]);
  assert.equal(run(env, ['keep', idOf(rows[1]), '--cwd', env.project]).stdout, `${idOf(rows[0])} kept\n`);
  assert.equal(run(env, ['candidates', '--cwd', env.project]).stdout, '');
});

test('an entry similar to a rejected cluster and an open one leaves the open one offered', () => {
  const env = fixture();
  const [rejected, open] = [pair('aa1 aa2 aa3 aa4', '2026-02-01'), pair('bb1 bb2 bb3 bb4', '2026-02-01')];
  writeLedger(env, [...fillers(100), ...rejected, ...open]);
  assert.equal(run(env, ['reject', idOf(rejected[0]), '--cwd', env.project]).status, 0);
  fs.appendFileSync(env.ledger, `${JSON.stringify(entryOf({ date: '2026-02-02', session: 'bridge', text: 'aa1 aa2 aa3 bb1 bb2 bb3' }))}\n`);
  assert.equal(run(env, ['candidates', '--cwd', env.project]).stdout, `${idOf(open[0])} "bb1 bb2 bb3 bb4" (3 sessions, 2026-01-01 to 2026-02-01)\n`);
});

test('a flagged cluster is still offered by candidates', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER, OLDER, { flagged: entryOf(EARLIER).words }]);
  assert.equal(run(env, ['candidates', '--cwd', env.project]).stdout, '');
  writeLedger(env, [...fillers(60), EARLIER, OLDER, { ...EARLIER, session: 'other' }, { flagged: entryOf(EARLIER).words }]);
  assert.match(run(env, ['candidates', '--cwd', env.project]).stdout, /\(3 sessions, 2026-01-01 to 2026-01-02\)/);
});

test('path-like tokens do not make a cluster', () => {
  const env = fixture();
  const text = 'src/one/aa.js src/one/bb.js src/one/cc.js';
  writeLedger(env, [...fillers(60), ...pair(text, '2026-03-01')]);
  assert.equal(run(env, ['candidates', '--cwd', env.project]).stdout, '');
});

test('backfill records every typed message of past sessions', () => {
  const env = fixture();
  const session = (name, texts, mtime) => {
    const file = path.join(env.folder, `${name}.jsonl`);
    const timestamp = mtime.toISOString();
    fs.writeFileSync(file, texts.map((text) => `${JSON.stringify({ type: 'user', timestamp, message: { content: text } })}\n`).join(''));
    fs.utimesSync(file, mtime, mtime);
  };
  session('one', ['first one', 'second one', '[Request interrupted by user]', 'x'.repeat(601)], new Date(2026, 0, 5, 12));
  session('two', ['first two', 'second two'], new Date(2026, 1, 6, 12));
  const result = run(env, ['backfill', '--cwd', env.project]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLedger(env), [
    { date: '2026-01-05', session: 'one', text: 'first one' },
    { date: '2026-01-05', session: 'one', text: 'second one' },
    { date: '2026-02-06', session: 'two', text: 'first two' },
    { date: '2026-02-06', session: 'two', text: 'second two' }
  ].map(entryOf));
});

test('the hook with no ledger exits 0 at once and prints nothing', () => {
  const env = fixture();
  assert.equal(hook(env, 'now', 'hello'), '');
  assert.equal(fs.existsSync(env.ledger), true);
});

test('the cache holds no prompt words in plain text and a cache with a text row is rebuilt', () => {
  const env = fixture();
  writeRows(env.ledger, [{ date: '2026-01-02', session: 'earlier', text: 'ancient prompt about walruses' }]);
  assert.equal(hook(env, 'now', 'distinctive zebra marmalade request'), '');
  const cache = fs.readFileSync(env.ledger, 'utf8');
  assert.equal(cache.includes('"seen":"now"'), true);
  assert.equal(/walrus|zebra|marmalade|"text"/.test(cache), false);
});

test('a rebuilt cache leaves no prompt text beside it and copies no verdict', () => {
  const env = fixture();
  const decided = { date: '2026-01-02', session: 'earlier', text: 'purple walrus zanzibar quokka' };
  writeRows(env.ledger, [{ date: '2026-01-02', session: 'earlier', text: 'ancient prompt' }, { verdict: 'kept', text: decided.text }]);
  fs.writeFileSync(`${env.ledger}.shown.json`, JSON.stringify([{ id: 'x', text: decided.text }]));
  assert.equal(hook(env, 'now', 'hello'), '');
  assert.equal(fs.existsSync(`${env.ledger}.shown.json`), false);
  assert.equal(fs.existsSync(verdictsPath(env)), false);
});

test('a row of unknown shape makes the hook rebuild the cache', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER, { seen: 'now' }, { id: 'badrow000000' }]);
  hook(env, 'now', REPEAT);
  assert.equal(fs.readFileSync(env.ledger, 'utf8').includes('badrow'), false);
});

test('a half-written last row is an append in progress and keeps the cache', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), { seen: 'now' }]);
  fs.appendFileSync(env.ledger, JSON.stringify(entryOf(EARLIER)).slice(0, 30));
  hook(env, 'now', REPEAT);
  assert.equal(readLedger(env).length, 62);
});

test('a hook that cannot get the lock in time writes and prints nothing, and a stale lock is taken over', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), EARLIER, OLDER, { seen: 'now' }]);
  const lock = `${env.ledger}.lock`;
  const before = fs.readFileSync(env.ledger, 'utf8');
  fs.writeFileSync(lock, '');
  const held = run(env, ['hook'], JSON.stringify({ session_id: 'now', prompt: REPEAT, cwd: env.project }), { EXO_LEARN_LOCK_MS: '100' });
  assert.equal(held.status, 0, held.stderr);
  assert.equal(held.stdout, '');
  assert.equal(fs.readFileSync(env.ledger, 'utf8'), before);
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(lock, old, old);
  assert.equal(hook(env, 'now', REPEAT).includes('on 2026-01-02'), true);
  assert.equal(readLedger(env).filter((row) => row.flagged !== undefined).length, 1);
  assert.equal(fs.existsSync(lock), false);
});

test('12 hooks started at once each leave their seen row and entry', async () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), { seen: 'seed' }]);
  const sessions = Array.from({ length: 12 }, (_, index) => `racer-${index}`);
  const children = sessions.map((session) => new Promise((resolve) => {
    const child = spawn('node', [script, 'hook'], { env: { ...inheritedEnv(), CLAUDE_CONFIG_DIR: env.config, EXO_LEARN_LOCK_MS: '60000' } });
    child.on('close', resolve);
    child.stdin.end(JSON.stringify({ session_id: session, prompt: `racer prompt ${session} unique words here`, cwd: env.project }));
  }));
  await Promise.all(children);
  const rows = readLedger(env);
  assert.equal(rows.length, 61 + 24);
  for (const session of sessions) {
    assert.equal(rows.filter((row) => row.seen === session).length, 1);
    assert.equal(rows.filter((row) => row.session === session).length, 1);
  }
});

test('recount drops an entry whose transcript is gone only when it is from before today', () => {
  const env = fixture();
  writeLedger(env, [...fillers(60), { seen: 'new' }]);
  const today = new Date().toISOString().slice(0, 10);
  writeRows(env.ledger, [...readLedger(env), entryOf({ date: '2026-01-01', session: 'gone', text: 'old prompt' }), entryOf({ date: today, session: 'new', text: 'fresh prompt' })]);
  assert.equal(run(env, ['recount', '--cwd', env.project]).status, 0);
  const sessions = readLedger(env).map(({ session }) => session);
  assert.equal(sessions.includes('new'), true);
  assert.equal(sessions.includes('gone'), false);
});

test('a cluster of turns Claude Code started itself is not counted, announced or listed', () => {
  const env = fixture();
  const notification = (session) => ({ date: '2026-01-01', session, text: `<task-notification>${REPEAT}</task-notification>` });
  writeLedger(env, [...fillers(60), notification('a'), notification('b')]);
  assert.equal(run(env, ['recount', '--cwd', env.project]).status, 0);
  assert.equal(countOf(env), 0);
  assert.equal(sessionStart(env, 'now'), '');
  assert.equal(run(env, ['candidates', '--cwd', env.project]).stdout, '');
});

test('the hook prints nothing and exits 0 on bad input', () => {
  const env = fixture();
  const result = run(env, ['hook'], 'not json');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

function transcriptLine(content, minute) {
  const day = new Date().toISOString().slice(0, 10);
  const timestamp = `${day}T10:${String(minute).padStart(2, '0')}:00.000Z`;
  return `${JSON.stringify({ type: 'user', timestamp, message: { content } })}\n`;
}

function slashEntry(name, args) {
  return `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>\n<command-args>${args}</command-args>`;
}

const modeOf = (file) => fs.statSync(file).mode & 0o777;

function assertPrivateStore(env) {
  assert.equal(modeOf(path.dirname(env.ledger)), 0o700);
  for (const file of [env.ledger, `${env.ledger}.count`, verdictsPath(env)]) {
    if (fs.existsSync(file)) assert.equal(modeOf(file), 0o600, file);
  }
  assert.equal(fs.existsSync(`${env.ledger}.lock`), false);
}

test('a store the hook creates is readable by its owner only and leaves its parent folder alone', () => {
  const env = fixture();
  hook(env, 'first', REPEAT);
  hook(env, 'second', REPEAT);
  assertPrivateStore(env);
  assert.notEqual(modeOf(path.dirname(path.dirname(env.ledger))), 0o700);
  assert.equal(fs.existsSync(env.ledger), true);
});

test('the hook narrows a widened store folder and cache back to their owner', () => {
  const env = fixture();
  writeLedger(env, [EARLIER, ...fillers(2)]);
  fs.chmodSync(path.dirname(env.ledger), 0o755);
  fs.chmodSync(env.ledger, 0o644);
  hook(env, 'later', REPEAT);
  assertPrivateStore(env);
});

test('keep and reject narrow widened verdict and count files back to their owner', () => {
  const env = fixture();
  const [first, second] = [pair('alpha bravo charlie delta echo', '2026-03-01'), pair('foxtrot golf hotel india juliet', '2026-02-01')];
  writeLedger(env, [...fillers(60), ...first, ...second]);
  fs.chmodSync(env.ledger, 0o600);
  assert.equal(run(env, ['keep', idOf(second[0]), '--cwd', env.project]).status, 0);
  fs.chmodSync(verdictsPath(env), 0o644);
  fs.chmodSync(`${env.ledger}.count`, 0o644);
  assert.equal(run(env, ['reject', idOf(first[0]), '--cwd', env.project]).status, 0);
  assertPrivateStore(env);
  assert.equal(fs.existsSync(`${env.ledger}.count`), true);
});

test('a hook started while a slow recount runs still stores its row', async () => {
  const env = fixture();
  const today = new Date().toISOString().slice(0, 10);
  const rows = Array.from({ length: 2000 }, (_, index) => entryOf({ date: today, session: `s${index % 60}`, text: Array.from({ length: 20 + (index % 30) }, (_, j) => `w${(index * 7919 + j) % 3000}`).join(' ') }));
  writeRows(env.ledger, rows);
  const recount = spawn('node', [script, 'recount', '--cwd', env.project], { env: { ...inheritedEnv(), CLAUDE_CONFIG_DIR: env.config }, stdio: 'ignore' });
  const finished = new Promise((resolve) => recount.on('exit', resolve));
  await new Promise((resolve) => setTimeout(resolve, 500));
  hook(env, 'new-session', 'please never amend commits without asking me first');
  await finished;
  assert.equal(readLedger(env).some((row) => row.seen === 'new-session'), true);
});

test('candidates ends with a total line when more clusters wait than it lists', () => {
  const env = fixture();
  const clusters = Array.from({ length: 16 }, (_, index) => pair(`wa${index} wb${index} wc${index} wd${index} we${index}`, '2026-02-01'));
  writeLedger(env, [...fillers(60), ...clusters.flat()]);
  const lines = run(env, ['candidates', '--cwd', env.project]).stdout.trimEnd().split('\n');
  assert.equal(lines.length, 16);
  assert.match(lines[14], /\(3 sessions, /);
  assert.equal(lines[15], '15 of 16 shown; keep or reject these to see more.');
});
