import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cacheUpdate, render } from '../lib/statusline.mjs';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-sl-'));
const env = { HOME: home };
const childEnv = (extra) => {
  const { CLAUDE_CODE_SESSION_ID: _drop, ...rest } = process.env;
  return { ...rest, HOME: home, ...extra };
};
const NOW = 1_000_000_000_000;
const SEC = NOW / 1000;
const D = (t) => `\x1b[2m${t}\x1b[0m`;
const MARK = '\x1b[1;38;5;141m◉ exo\x1b[0m';
const payload = (tokens, extra = {}) => ({ context_window: { total_input_tokens: tokens, context_window_size: 1_000_000 }, ...extra });
const line = (p, opts = {}) => render(p, { env, now: NOW, cache: null, ...opts });
const plain = (p, opts = {}) => line(p, { env: { ...env, NO_COLOR: '1' }, ...opts });

test('two lines with the mark, branch, model, effort and build', () => {
  const p = payload(64_000, { model: { display_name: 'Opus 5.5 (1M context)' }, effort: { level: 'High' } });
  assert.equal(
    line(p, { branch: 'main', build: { landed: 2, total: 7 } }),
    `${MARK}   main   ${D('Opus 5.5 high')}   \x1b[1mbuild 3/7\x1b[0m\n  ${D('ctx')} 64k${D('/1000k')}   ${D('5h')} –%`,
  );
  assert.equal(plain(p, { branch: 'main', build: { landed: 9, total: 7 } }), '◉ exo   main   Opus 5.5 high   build 7/7\n  ctx 64k/1000k   5h –%');
});

test('parts without data drop', () => {
  assert.equal(plain(payload(1)), '◉ exo\n  ctx 0k/1000k   5h –%');
});

test('context shows used over context_window.context_window_size, warns at 80k, defaults to 200k', () => {
  const W = (t) => `\x1b[38;5;215m${t}\x1b[0m`;
  assert.equal(line(payload(79_000)).split('\n')[1], `  ${D('ctx')} 79k${D('/1000k')}   ${D('5h')} –%`);
  assert.equal(line(payload(80_000)).split('\n')[1], `  ${D('ctx')} ${W('80k')}${D('/1000k')}   ${D('5h')} –%`);
  const small = { context_window: { total_input_tokens: 48_000, context_window_size: 150_000 } };
  assert.equal(plain(small).split('\n')[1], '  ctx 48k/150k   5h –%');
  assert.equal(plain({ context_window: { total_input_tokens: 48_000 } }).split('\n')[1], '  ctx 48k/200k   5h –%');
});

test('7d shows from 50 percent and the cache fills a missing payload', () => {
  const limits = (week) => ({ five_hour: { resets_at: SEC + 9000, used_percentage: 6 }, seven_day: { used_percentage: week } });
  assert.equal(plain(payload(1, { rate_limits: limits(49) })).split('\n')[1], '  ctx 0k/1000k   5h 6%');
  assert.equal(plain(payload(1, { rate_limits: limits(50) })).split('\n')[1], '  ctx 0k/1000k   5h 6%   7d 50%');
  const cache = { cached_at: SEC - 100, five_hour: { resets_at: SEC + 2400, used_percentage: 9 }, seven_day: { resets_at: null, used_percentage: 80 } };
  assert.equal(plain(payload(1), { cache }).split('\n')[1], '  ctx 0k/1000k   5h 9%   7d 80%');
});

test('expired cache falls back', () => {
  const cache = { cached_at: SEC - 13 * 3600, five_hour: { resets_at: SEC - 5, used_percentage: 9 }, seven_day: { resets_at: null, used_percentage: 80 } };
  assert.equal(plain(payload(1), { cache }).split('\n')[1], '  ctx 0k/1000k   5h –%');
});

test('5h run-out warning', () => {
  const at = (elapsedMin, used) => ({ rate_limits: { five_hour: { resets_at: SEC + (300 - elapsedMin) * 60, used_percentage: used } } });
  const second = (p) => plain(payload(1, p)).split('\n')[1];
  assert.equal(second(at(29, 90)), '  ctx 0k/1000k   5h 90%');
  assert.equal(second(at(150, 71)), '  ctx 0k/1000k   5h 71%   5h out in 1h 2m');
  assert.equal(line(payload(1, at(150, 71))).split('\n')[1].endsWith('\x1b[38;5;215m5h out in 1h 2m\x1b[0m'), true);
  assert.equal(second(at(150, 50)), '  ctx 0k/1000k   5h 50%');
  assert.equal(second(at(150, 30)), '  ctx 0k/1000k   5h 30%');
  assert.equal(second(at(60, 100)), '  ctx 0k/1000k   5h 100%   5h out in 0m');
  assert.equal(second(at(200, 90)), '  ctx 0k/1000k   5h 90%   5h out in 23m');
});

test('long branch is cut to 19 characters plus an ellipsis; control characters go', () => {
  assert.equal(plain(payload(1), { branch: 'a'.repeat(21) }).split('\n')[0], `◉ exo   ${'a'.repeat(19)}…`);
  assert.equal(plain(payload(1), { branch: 'b'.repeat(20) }).split('\n')[0], `◉ exo   ${'b'.repeat(20)}`);
  assert.equal(plain(payload(1, { model: { display_name: 'Op\x1b[31mus' } })).split('\n')[0], '◉ exo   Op[31mus');
});

test('NO_COLOR drops every SGR code', () => {
  assert.equal(plain(payload(1, { model: { display_name: 'Opus 5' } }), { branch: 'x' }).includes('\x1b'), false);
});

test('worst case stays within 60 visible characters per line', () => {
  const p = payload(150_000, {
    model: { display_name: 'Opus 5.5' }, effort: { level: 'xhigh' },
    rate_limits: { five_hour: { resets_at: SEC + 240 * 60, used_percentage: 50 }, seven_day: { used_percentage: 99 } },
  });
  const lines = plain(p, { branch: 'a'.repeat(30), build: { landed: 9, total: 12 } }).split('\n');
  assert.equal(lines[0], `◉ exo   ${'a'.repeat(19)}…   Opus 5.5 xhigh   build 10/12`);
  assert.equal(lines[1], '  ctx 150k/1000k   5h 50%   7d 99%   5h out in 1h 0m');
  for (const text of lines) assert.ok(text.length <= 60, text);
});

test('transcript token count wins over the payload count', () => {
  const transcript = path.join(home, 'transcript.jsonl');
  const usage = { input_tokens: 1000, cache_read_input_tokens: 70_000, cache_creation_input_tokens: 6000 };
  fs.writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 5 } } })}\n${JSON.stringify({ type: 'assistant', message: { usage } })}\n`);
  assert.equal(plain(payload(5000, { transcript_path: transcript })).split('\n')[1], '  ctx 77k/1000k   5h –%');
});

test('cacheUpdate stores only fresh windows', () => {
  assert.equal(cacheUpdate({}, null, NOW), null);
  const u = cacheUpdate({ rate_limits: { five_hour: { resets_at: SEC + 60, used_percentage: 3 } } }, null, NOW);
  assert.deepEqual(u, { cached_at: SEC, five_hour: { resets_at: SEC + 60, used_percentage: 3 }, seven_day: null });
});

test('main prints a line for malformed stdin and exits 0', () => {
  const r = spawnSync(process.execPath, ['-e', "import('./lib/statusline.mjs').then((m) => m.main())"], {
    input: '{not json', encoding: 'utf8', env: childEnv({ XDG_CACHE_HOME: path.join(home, 'cache'), NO_COLOR: '1' }),
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '◉ exo\n  ctx 0k/200k   5h –%');
});

test('main writes the cache atomically from rate_limits', () => {
  const cache = path.join(home, 'cache2');
  const input = JSON.stringify(payload(1, { rate_limits: { seven_day: { used_percentage: 12 } } }));
  spawnSync(process.execPath, ['-e', "import('./lib/statusline.mjs').then((m) => m.main())"], {
    input, encoding: 'utf8', env: childEnv({ XDG_CACHE_HOME: cache }),
  });
  const saved = JSON.parse(fs.readFileSync(path.join(cache, 'exo', 'statusline-rate-limits.json'), 'utf8'));
  assert.equal(saved.seven_day.used_percentage, 12);
  assert.deepEqual(fs.readdirSync(path.join(cache, 'exo')), ['statusline-rate-limits.json']);
});

test('main reads the branch from a worktree .git file and the session build record', () => {
  const cache = path.join(home, 'cache3');
  const repo = path.join(home, 'repo');
  const gitdir = path.join(home, 'repo-git');
  fs.mkdirSync(path.join(repo, 'sub'), { recursive: true });
  fs.mkdirSync(gitdir);
  fs.writeFileSync(path.join(repo, '.git'), `gitdir: ${gitdir}\n`);
  fs.writeFileSync(path.join(gitdir, 'HEAD'), 'ref: refs/heads/feature/x\n');
  fs.mkdirSync(path.join(cache, 'exo', 'build'), { recursive: true });
  const record = { sessionId: 's9', plan: 'p', checkout: repo, landed: 1, total: 4, updatedAt: Date.now() };
  fs.writeFileSync(path.join(cache, 'exo', 'build', 's9.json'), JSON.stringify(record));
  const run = (input) => spawnSync(process.execPath, ['-e', "import('./lib/statusline.mjs').then((m) => m.main())"], {
    input: JSON.stringify(input), encoding: 'utf8', env: childEnv({ XDG_CACHE_HOME: cache, NO_COLOR: '1' }),
  }).stdout;
  assert.equal(run({ workspace: { current_dir: path.join(repo, 'sub') }, session_id: 's9' }), '◉ exo   feature/x   build 2/4\n  ctx 0k/200k   5h –%');
  fs.writeFileSync(path.join(gitdir, 'HEAD'), `${'ab12cd3'.padEnd(40, 'e')}\n`);
  assert.equal(run({ cwd: repo, session_id: 'other' }), '◉ exo   ab12cd3\n  ctx 0k/200k   5h –%');
  assert.equal(run({ cwd: os.tmpdir() }).startsWith('◉ exo\n'), true);
});
