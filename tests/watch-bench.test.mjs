import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compareRows, readCases, tableRows } from '../evals/watch-bench.mjs';
import {
  claimsOf, coverageOf, distinctOrders, hitsShare, judgePrompt, minutesOf, plantedMissed, spreadOf, stampOverlap, stampTotals, tokensOf, toolOrder, verdictsOf, windowOf
} from '../evals/watch-bench-metrics.mjs';
import { tempDir } from './harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RUNNER = path.join(ROOT, 'evals', 'watch-bench-run.mjs');
const READER = path.join(ROOT, 'evals', 'watch-bench.mjs');
const SESSIONS = path.join(ROOT, 'skills', 'learn', 'scripts', 'sessions.mjs');
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello there\n';

const tool = (id, name, input, timestamp = '2026-01-01T00:00:01.000Z') => ({ type: 'assistant', timestamp, message: { id, content: [{ type: 'tool_use', name, input }], usage: { input_tokens: 2, cache_creation_input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 } } });
const link = (id, second) => `[x](https://youtu.be/${id}?t=${second})`;

test('the tool order names a watch script by its file and ignores helper lines', () => {
  const lines = [
    { type: 'user', message: { content: 'go' } },
    tool('a', 'Skill', { skill: 'exo:watch' }),
    tool('b', 'Bash', { command: 'node /p/skills/watch/scripts/transcript.mjs --url u' }),
    { ...tool('c', 'Read', {}), isSidechain: true },
    tool('d', 'Bash', { command: 'ls' })
  ];
  assert.deepEqual(toolOrder(lines), ['Skill', 'Bash:transcript.mjs', 'Bash']);
  assert.equal(distinctOrders([['a', 'b'], ['a', 'b'], ['b', 'a']]), 2);
});

test('tokens count one message once, however many lines repeat it', () => {
  const lines = [tool('m1', 'Bash', {}), tool('m1', 'Read', {}), tool('m2', 'Read', {})];
  assert.deepEqual(tokensOf(lines), { fresh: 34, cacheRead: 200 });
});

test('minutes run from the first user line to the last assistant line', () => {
  const lines = [{ type: 'user', timestamp: '2026-01-01T00:00:00.000Z' }, tool('a', 'Bash', {}, '2026-01-01T00:03:30.000Z'), { type: 'system', timestamp: '2026-01-01T01:00:00.000Z' }];
  assert.equal(minutesOf(lines), 3.5);
});

test('stamp overlap is the share of stamps every run holds, by 30-second bucket and by second', () => {
  const run = (...seconds) => seconds.map((second) => link('abcdefghijk', second)).join(' ');
  const result = stampOverlap([run(31, 100), run(45, 200), run(59, 300)]);
  assert.equal(result.shared, 1 / 4);
  assert.equal(result.exact, 0);
});

test('claims are the first 20 lines or rows with a link stamp', () => {
  const answer = ['intro', ...Array.from({ length: 25 }, (_, index) => `| point ${index} | ${link('abcdefghijk', index)} |`)].join('\n');
  const claims = claimsOf(answer);
  assert.equal(claims.length, 20);
  assert.deepEqual([claims[3].id, claims[3].second], ['abcdefghijk', 3]);
});

test('the judge window runs from 5 seconds before to 45 seconds after the stamp, and verdicts read the last word', () => {
  const transcript = [0, 20, 25, 75, 76].map((second) => `[x](https://youtu.be/abcdefghijk?t=${second}) line ${second}`).join('\n');
  assert.deepEqual(windowOf(transcript, 30).map((line) => line.second), [25, 75]);
  assert.match(judgePrompt([{ claim: 'c', lines: windowOf(transcript, 30) }]), /^Claim C1: c\nLines:\n/m);
  assert.deepEqual(verdictsOf('C1: matches pass\nC2: it does not fail\nnoise', 3), ['pass', 'fail', undefined]);
  assert.equal(plantedMissed({ own: 'pass', foreign: 'fail' }), false);
  assert.equal(plantedMissed({ own: 'pass', foreign: 'pass' }), true);
  assert.equal(hitsShare(['pass', 'fail', 'pass', 'pass']), 0.75);
});

test('stamp totals check against the copied transcript', () => {
  const transcripts = { abcdefghijk: `${link('abcdefghijk', 0)} a\n${link('abcdefghijk', 30)} b\n` };
  assert.deepEqual(stampTotals(`${link('abcdefghijk', 30)} ${link('abcdefghijk', 31)} ${link('zyxwvutsrqp', 5)}`, transcripts), { exact: 1, off: 1, unchecked: 1 });
});

test('coverage is the share of chapters with a stamp, or of videos cited', () => {
  assert.equal(coverageOf(`${link('abcdefghijk', 5)} ${link('abcdefghijk', 120)} ${link('abcdefghijk', 130)}`, { ids: ['abcdefghijk'], chapters: [0, 100, 200, 300] }), 0.5);
  assert.equal(coverageOf(link('zyxwvutsrqp', 5), { ids: ['abcdefghijk', 'zyxwvutsrqp'], chapters: [] }), 0.5);
  assert.deepEqual(spreadOf([3, 1, 2]), { low: 1, high: 3 });
});

test('the cases file holds the fixed videos, runs and chapters', () => {
  const { budgets, cases } = readCases();
  assert.deepEqual(budgets, { batchUsd: 1.45, judgeUsd: 0.2 });
  assert.deepEqual(cases.map((entry) => [entry.name, entry.runs, entry.chapters.length, entry.split]), [['BBPQYtR7oUk', 3, 13, 'tune'], ['qyLutqZ7Lqw', 3, 26, 'tune'], ['zjkBMFhNj_g', 3, 21, 'tune'], ['t3YJ5hKiMQ0', 3, 18, 'holdout'], ['batch', 1, 0, 'tune']]);
  assert.equal(cases[4].ids.length, 30);
  assert.equal(cases[4].request.split('\n').length, 31);
});

const row = (name, value, low = value, high = value) => ({ row: name, value, runs: 3, low, high, errors: 0 });

test('compare calls a change moved or worse only beyond the spread, and short of goal when the goal is missed', () => {
  const baseline = [row('minutes', 1, 0.9, 1.1), row('hits', 90, 89, 91), row('coverage', 95, 94, 96), row('tokens', 40000, 39000, 41000)];
  const after = [row('minutes', 0.4, 0.4, 0.5), row('hits', 70, 70, 71), row('coverage', 94.5, 94, 95), row('tokens', 30000, 29500, 30500)];
  const verdicts = Object.fromEntries(compareRows(baseline, after).map((entry) => [entry.key, entry.verdict]));
  assert.deepEqual([verdicts.minutes, verdicts.hits, verdicts.coverage, verdicts.tokens], ['moved', 'worse', 'same', 'short of goal']);
  assert.equal(verdicts['tool-order'], 'missing');
});

function fakeEnvironment() {
  const work = fs.realpathSync(tempDir('bench-'));
  const bin = path.join(work, 'bin');
  fs.mkdirSync(bin);
  const log = path.join(work, 'claude-log.jsonl');
  fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
if (args.includes('--tools')) {
  let input = '';
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    const out = input.split(/^Claim C/m).slice(1).map((block) => {
      const [head, ...rest] = block.split('\\nLines:\\n');
      const claim = head.replace(/^\\d+: /, '');
      const texts = rest.join('').split('\\n').map((line) => line.replace(/^\\[[^\\]]*\\]\\([^)]*\\) /, '')).filter(Boolean);
      return 'C' + head.match(/^\\d+/)[0] + ': compared with the lines ' + (texts.some((text) => claim.includes(text)) ? 'pass' : 'fail');
    });
    console.log(out.join('\\n'));
  });
} else {
  const id = args[args.indexOf('--session-id') + 1];
  const video = args[1].match(/v=([\\w-]{11})/)[1];
  fs.appendFileSync(process.env.EXO_BENCH_COUNT, 'call\\n');
  const folder = path.join(process.cwd(), '.t', video);
  fs.mkdirSync(folder, { recursive: true });
  const transcript = path.join(folder, 'transcript.txt');
  fs.writeFileSync(transcript, '[0:00](https://youtu.be/' + video + '?t=0) alpha words\\n[0:30](https://youtu.be/' + video + '?t=30) beta words\\n');
  const usage = { input_tokens: 2, cache_creation_input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 };
  const assistant = (mid, timestamp, content) => ({ type: 'assistant', timestamp, message: { id: mid, content, usage } });
  const lines = [
    { type: 'user', timestamp: '2026-01-01T00:00:00.000Z', message: { content: 'go' } },
    assistant('m1', '2026-01-01T00:01:00.000Z', [{ type: 'tool_use', name: 'Bash', input: { command: 'node /p/skills/watch/scripts/transcript.mjs --url u' } }]),
    { type: 'user', timestamp: '2026-01-01T00:01:30.000Z', message: { content: [{ type: 'tool_result', content: 'id=' + video + ' transcript=' + transcript + ' tokens=9' }] } },
    assistant('m2', '2026-01-01T00:02:00.000Z', [{ type: 'text', text: 'done' }])
  ];
  import(pathToFileURL(${JSON.stringify(SESSIONS)}).href).then(({ projectFolder }) => {
    const folderOf = projectFolder(process.cwd());
    fs.mkdirSync(path.join(folderOf, id, 'subagents'), { recursive: true });
    fs.writeFileSync(path.join(folderOf, id + '.jsonl'), lines.map((line) => JSON.stringify(line)).join('\\n') + '\\n');
    fs.writeFileSync(path.join(folderOf, id, 'subagents', 'agent-1.jsonl'), JSON.stringify(assistant('h1', '2026-01-01T00:01:10.000Z', [{ type: 'text', text: 'notes' }])) + '\\n');
    const answer = process.env.FAKE_STAMPLESS === video ? '- main point without a stamp' : '- main point ' + '[0:30](https://youtu.be/' + video + '?t=30) beta words';
    console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: answer }));
  });
}
`, { mode: 0o755 });
  const ytdlp = path.join(bin, 'yt-dlp');
  fs.writeFileSync(ytdlp, `#!/bin/sh
case "$*" in
  *--version*) echo 1;;
  *--dump-json*) echo '{"title":"T","duration":10,"subtitles":{"en":[{}]},"extractor":"youtube"}';;
  *) while [ $# -gt 0 ]; do [ "$1" = "-P" ] && dir="$2"; shift; done; printf '%b' '${VTT.replaceAll('\n', '\\n')}' > "$dir/captions.en.vtt";;
esac
`, { mode: 0o755 });
  const bench = path.join(work, 'bench');
  const env = { PATH: `${bin}${path.delimiter}/usr/bin${path.delimiter}/bin`, HOME: work, TMPDIR: work, CLAUDE_CONFIG_DIR: path.join(work, 'config'), EXO_WATCH_BENCH_ROOT: bench, EXO_YTDLP: ytdlp, FAKE_LOG: log };
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
  const start = (file, ...args) => {
    const extra = typeof args.at(-1) === 'object' ? args.pop() : {};
    return spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', env: { ...env, ...extra }, cwd: ROOT, timeout: 50000 });
  };
  return { bench, calls, start };
}

test('a dry run and a sum over --max-usd start no claude and keep nothing', () => {
  const { bench, calls, start } = fakeEnvironment();
  const dry = start(RUNNER, '--label', 't1', '--max-usd', '10', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /sessions: 26, budget sum: 8\.55 USD/);
  const over = start(RUNNER, '--label', 't1', '--max-usd', '8');
  assert.equal(over.status, 1);
  assert.match(over.stderr, /refused: the budget sum 8\.55 USD is over --max-usd 8\.00/);
  assert.equal(calls().length, 0);
  assert.equal(fs.existsSync(bench), false);
});

test('a pass with a stand-in claude keeps each run, appends 11 rows and starts claude as the plan says', () => {
  const { bench, calls, start } = fakeEnvironment();
  const result = start(RUNNER, '--label', 't1', '--max-usd', '10');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /error rows: 0 of 13/);
  const sessions = calls();
  assert.equal(sessions.length, 26);
  for (const { args, cwd } of sessions) {
    assert.ok(args.includes('--max-budget-usd'), args.join(' '));
    assert.equal(args.some((arg) => /skip-permissions|permission-mode/.test(arg)), false);
    assert.equal(path.relative(ROOT, cwd).startsWith('..'), true, cwd);
  }
  const runs = sessions.filter(({ args }) => !args.includes('--tools'));
  assert.deepEqual(runs.map(({ args }) => args[args.indexOf('--max-budget-usd') + 1]).sort(), ['0.15', '0.15', '0.15', '0.25', '0.25', '0.25', '0.55', '0.55', '0.55', '0.55', '0.55', '0.55', '1.45'].sort());
  assert.equal(runs.length, 13);
  for (const { args } of runs) {
    assert.equal(args[args.indexOf('--plugin-dir') + 1], ROOT);
    assert.equal(args[args.indexOf('--allowedTools') + 1], 'Skill,Read,Write,Agent,Bash(node *)');
  }
  const kept = path.join(bench, 'results', 'watch-bench', 't1', 'BBPQYtR7oUk', '1');
  assert.match(fs.readFileSync(path.join(kept, 'tool-order.txt'), 'utf8'), /^Bash:transcript\.mjs$/m);
  assert.equal(fs.existsSync(path.join(kept, 'transcripts', 'BBPQYtR7oUk.txt')), true);
  process.env.EXO_WATCH_BENCH_ROOT = bench;
  const rows = Object.fromEntries(tableRows('t1').map((entry) => [entry.row, entry]));
  assert.equal(Object.keys(rows).length, 11);
  assert.equal(rows['ytdlp-calls'].value, 0);
  assert.equal(rows.stamps.value, 100);
  assert.equal(rows.hits.value, 100);
  assert.equal(rows.minutes.value, 2);
  delete process.env.EXO_WATCH_BENCH_ROOT;
  const all = start(READER, '--metric', 'all', '--label', 't1');
  assert.equal(all.status, 0, all.stderr);
  const again = start(RUNNER, '--label', 't1', '--max-usd', '10');
  assert.equal(again.status, 1);
  assert.equal(calls().length, 26);
});

test('a stampless answer is scored as a failure without a judge call or an error row', () => {
  const { bench, calls, start } = fakeEnvironment();
  const result = start(RUNNER, '--label', 't3', '--max-usd', '10', { FAKE_STAMPLESS: 'bFcob2p6u3A' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /error rows: 0 of 13/);
  assert.equal(calls().filter(({ args }) => args.includes('--tools')).length, 12);
  assert.equal(fs.readFileSync(path.join(bench, 'results', 'watch-bench', 't3', 'batch', '1', 'verdicts.json'), 'utf8'), '[]');
  process.env.EXO_WATCH_BENCH_ROOT = bench;
  const rows = Object.fromEntries(tableRows('t3').map((entry) => [entry.row, entry]));
  delete process.env.EXO_WATCH_BENCH_ROOT;
  assert.ok(rows.stamps.value < 100, `stamps ${rows.stamps.value}`);
  assert.ok(rows.hits.value < 100, `hits ${rows.hits.value}`);
});

test('--metric all for a label with no rows exits 1, and --metric tokens needs as many runs as --repeat', () => {
  const { start } = fakeEnvironment();
  const none = start(READER, '--metric', 'all', '--label', 'missing');
  assert.equal(none.status, 1);
  assert.match(none.stderr, /label missing has no row for/);
  start(RUNNER, '--label', 't2', '--max-usd', '10');
  const enough = start(READER, '--metric', 'tokens', '--label', 't2', '--repeat', '3');
  assert.equal(enough.status, 0, enough.stderr);
  const short = start(READER, '--metric', 'tool-order', '--label', 't2', '--repeat', '4');
  assert.equal(short.status, 1);
  assert.match(short.stderr, /fewer than --repeat 4/);
});

test('the ytdlp-calls case starts from its own empty store, calls yt-dlp twice in run 1 and not in run 2', () => {
  const { start } = fakeEnvironment();
  const result = start(READER, '--metric', 'ytdlp-calls', '--repeat', '2', { EXO_WATCH_STORE: '' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout, 'run 1: 2\nrun 2: 0\n');
});
