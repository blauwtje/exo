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
const G = (t) => `\x1b[32m${t}\x1b[0m`;
const C = (t) => `\x1b[32m${t}\x1b[0m`;
const MARK = '\x1b[1;38;5;141m◉ exo\x1b[0m';
const payload = (tokens, extra = {}) => ({ context_window: { total_input_tokens: tokens, context_window_size: 1_000_000 }, ...extra });
const line = (p, opts = {}) => render(p, { env, now: NOW, cache: null, ...opts });
const plain = (p, opts = {}) => line(p, { env: { ...env, NO_COLOR: '1' }, ...opts });

test('two lines with the mark, branch, model, effort and build', () => {
  const p = payload(64_000, { model: { display_name: 'Opus 5.5 (1M context)' }, effort: { level: 'High' } });
  assert.equal(
    line(p, { branch: 'main', build: { landed: 2, total: 7 } }),
    `${MARK}   main   ${D('Opus 5.5 high')}   \x1b[1mbuild 3/7\x1b[0m\n  ${D('ctx')} ${C('64k')}${D('/1M')}   ${D('5h')} –%   ${D('7d')} –%`,
  );
  assert.equal(plain(p, { branch: 'main', build: { landed: 9, total: 7 } }), '◉ exo   main   Opus 5.5 high   build 7/7\n  ctx 64k/1M   5h –%   7d –%');
});

test('parts without data drop', () => {
  assert.equal(plain(payload(1)), '◉ exo\n  ctx 0k/1M   5h –%   7d –%');
});

test('context shows used over the window and the count stays green at every size', () => {
  const second = (p) => line(p).split('\n')[1];
  const tail = `${D('5h')} –%   ${D('7d')} –%`;
  const colored = (code, used, limit) => `  ${D('ctx')} \x1b[${code}m${used}\x1b[0m${D(`/${limit}`)}   ${tail}`;
  assert.equal(second(payload(59_000)), colored(32, '59k', '1M'));
  assert.equal(second(payload(60_000)), colored(32, '60k', '1M'));
  assert.equal(second(payload(79_000)), colored(32, '79k', '1M'));
  assert.equal(second(payload(80_000)), colored(32, '80k', '1M'));
  assert.equal(plain({ context_window: { total_input_tokens: 48_000 } }).split('\n')[1], '  ctx 48k/80k   5h –%   7d –%');
  const sized = (tokens, size) => ({ context_window: { total_input_tokens: tokens, context_window_size: size } });
  assert.equal(plain(sized(10_000, 200_000)).split('\n')[1], '  ctx 10k/200k   5h –%   7d –%');
  assert.equal(second(sized(59_000, 200_000)), colored(32, '59k', '200k'));
  assert.equal(second(sized(60_000, 200_000)), colored(32, '60k', '200k'));
  assert.equal(second(sized(80_000, 200_000)), colored(32, '80k', '200k'));
  assert.equal(second(sized(200_000, 200_000)), colored(32, '200k', '200k'));
});

test('7d always shows and the cache fills a missing payload', () => {
  const limits = (week) => ({ five_hour: { resets_at: SEC + 9000, used_percentage: 6 }, seven_day: { used_percentage: week } });
  assert.equal(plain(payload(1, { rate_limits: limits(49) })).split('\n')[1], '  ctx 0k/1M   5h 6% resets in 2h 30m   7d 49%');
  assert.equal(plain(payload(1, { rate_limits: limits(50) })).split('\n')[1], '  ctx 0k/1M   5h 6% resets in 2h 30m   7d 50%');
  const cache = { cached_at: SEC - 100, five_hour: { resets_at: SEC + 2400, used_percentage: 9 }, seven_day: { resets_at: null, used_percentage: 80 } };
  assert.equal(plain(payload(1), { cache }).split('\n')[1], '  ctx 0k/1M   5h 9% resets in 40m   7d 80%');
});

test('denominator is context_window.context_window_size, the 80k limit only when the size is missing', () => {
  const second = (size) => plain({ context_window: { total_input_tokens: 0, context_window_size: size } }).split('\n')[1];
  assert.equal(second(1_000_000), '  ctx 0k/1M   5h –%   7d –%');
  assert.equal(second(200_000), '  ctx 0k/200k   5h –%   7d –%');
  assert.equal(second(50_000), '  ctx 0k/50k   5h –%   7d –%');
  assert.equal(second(0), '  ctx 0k/80k   5h –%   7d –%');
  assert.equal(second(undefined), '  ctx 0k/80k   5h –%   7d –%');
});

test('reset countdowns follow both percentages, dimmed, day scale from 24 hours', () => {
  const limits = {
    five_hour: { resets_at: SEC + 80 * 60, used_percentage: 60 },
    seven_day: { resets_at: SEC + (3 * 24 + 4) * 3600 + 600, used_percentage: 40 },
  };
  assert.equal(plain(payload(1, { rate_limits: limits })).split('\n')[1], '  ctx 0k/1M   5h 60% resets in 1h 20m   7d 40% resets in 3d 4h');
  assert.equal(
    line(payload(1, { rate_limits: limits })).split('\n')[1],
    `  ${D('ctx')} ${G('0k')}${D('/1M')}   ${D('5h')} 60% ${D('resets in 1h 20m')}   ${D('7d')} 40% ${D('resets in 3d 4h')}`,
  );
  const edge = { seven_day: { resets_at: SEC + 1440 * 60, used_percentage: 1 } };
  assert.equal(plain(payload(1, { rate_limits: edge })).split('\n')[1], '  ctx 0k/1M   5h –%   7d 1% resets in 1d 0h');
});

test('no countdown for a null window, an unknown reset or a reset in the past', () => {
  assert.equal(plain(payload(1)).split('\n')[1], '  ctx 0k/1M   5h –%   7d –%');
  const unknown = { five_hour: { used_percentage: 5 }, seven_day: { resets_at: SEC - 1, used_percentage: 7 } };
  assert.equal(plain(payload(1, { rate_limits: unknown })).split('\n')[1], '  ctx 0k/1M   5h 5%   7d 7%');
});

test('expired cache falls back', () => {
  const cache = { cached_at: SEC - 13 * 3600, five_hour: { resets_at: SEC - 5, used_percentage: 9 }, seven_day: { resets_at: null, used_percentage: 80 } };
  assert.equal(plain(payload(1), { cache }).split('\n')[1], '  ctx 0k/1M   5h –%   7d –%');
});

test('5h run-out warning', () => {
  const at = (elapsedMin, used) => ({ rate_limits: { five_hour: { resets_at: SEC + (300 - elapsedMin) * 60, used_percentage: used } } });
  const second = (p) => plain(payload(1, p)).split('\n')[1];
  assert.equal(second(at(29, 90)), '  ctx 0k/1M   5h 90% resets in 4h 31m   7d –%');
  assert.equal(second(at(150, 71)), '  ctx 0k/1M   5h 71% resets in 2h 30m   7d –%   5h out in 1h 2m');
  assert.equal(line(payload(1, at(150, 71))).split('\n')[1].endsWith('\x1b[38;5;215m5h out in 1h 2m\x1b[0m'), true);
  assert.equal(second(at(150, 50)), '  ctx 0k/1M   5h 50% resets in 2h 30m   7d –%');
  assert.equal(second(at(150, 30)), '  ctx 0k/1M   5h 30% resets in 2h 30m   7d –%');
  assert.equal(second(at(60, 100)), '  ctx 0k/1M   5h 100% resets in 4h 0m   7d –%   5h out in 0m');
  assert.equal(second(at(200, 90)), '  ctx 0k/1M   5h 90% resets in 1h 40m   7d –%   5h out in 23m');
});

test('long branch is cut to 19 characters plus an ellipsis; control characters go', () => {
  assert.equal(plain(payload(1), { branch: 'a'.repeat(21) }).split('\n')[0], `◉ exo   ${'a'.repeat(19)}…`);
  assert.equal(plain(payload(1), { branch: 'b'.repeat(20) }).split('\n')[0], `◉ exo   ${'b'.repeat(20)}`);
  assert.equal(plain(payload(1, { model: { display_name: 'Op\x1b[31mus' } })).split('\n')[0], '◉ exo   Op[31mus');
});

test('NO_COLOR drops every SGR code', () => {
  assert.equal(plain(payload(1, { model: { display_name: 'Opus 5' } }), { branch: 'x' }).includes('\x1b'), false);
});

test('worst case stays within 83 visible characters per line', () => {
  const p = payload(150_000, {
    model: { display_name: 'Opus 5.5' }, effort: { level: 'xhigh' },
    rate_limits: { five_hour: { resets_at: SEC + 240 * 60, used_percentage: 50 }, seven_day: { resets_at: SEC + (6 * 24 + 23) * 3600, used_percentage: 99 } },
  });
  const lines = plain(p, { branch: 'a'.repeat(30), build: { landed: 9, total: 12 } }).split('\n');
  assert.equal(lines[0], `◉ exo   ${'a'.repeat(19)}…   Opus 5.5 xhigh   build 10/12`);
  assert.equal(lines[1], '  ctx 150k/1M   5h 50% resets in 4h 0m   7d 99% resets in 6d 23h   5h out in 1h 0m');
  for (const text of lines) assert.ok(text.length <= 83, text);
});

test('transcript token count wins over the payload count', () => {
  const transcript = path.join(home, 'transcript.jsonl');
  const usage = { input_tokens: 1000, cache_read_input_tokens: 70_000, cache_creation_input_tokens: 6000 };
  fs.writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 5 } } })}\n${JSON.stringify({ type: 'assistant', message: { usage } })}\n`);
  assert.equal(plain(payload(5000, { transcript_path: transcript })).split('\n')[1], '  ctx 77k/1M   5h –%   7d –%');
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
  assert.equal(r.stdout, '◉ exo\n  ctx 0k/80k   5h –%   7d –%');
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
  assert.equal(run({ workspace: { current_dir: path.join(repo, 'sub') }, session_id: 's9' }), '◉ exo   feature/x   build 2/4\n  ctx 0k/80k   5h –%   7d –%');
  fs.writeFileSync(path.join(gitdir, 'HEAD'), `${'ab12cd3'.padEnd(40, 'e')}\n`);
  assert.equal(run({ cwd: repo, session_id: 'other' }), '◉ exo   ab12cd3\n  ctx 0k/80k   5h –%   7d –%');
  assert.equal(run({ cwd: os.tmpdir() }).startsWith('◉ exo\n'), true);
});
