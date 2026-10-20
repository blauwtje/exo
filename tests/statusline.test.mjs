import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cacheUpdate, render } from '../lib/statusline.mjs';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-sl-'));
const env = { HOME: home };
const NOW = 1_000_000_000_000;
const SEC = NOW / 1000;
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', Z = '\x1b[0m', B = '\x1b[1mexo\x1b[0m';
const payload = (tokens, extra = {}) => ({ context_window: { total_input_tokens: tokens, context_window_size: 1_000_000 }, ...extra });
const line = (p, opts = {}) => render(p, { env, now: NOW, cache: null, ...opts });

test('context bands flip at S and L', () => {
  assert.equal(line(payload(59_999)), `${B} ${G}60.0k (6.0%)${Z} · 5h –% · 7d –%`);
  assert.equal(line(payload(60_000)), `${B} ${Y}60.0k (6.0%)${Z} · 5h –% · 7d –%`);
  assert.equal(line(payload(99_999)), `${B} ${Y}100.0k (10.0%)${Z} · 5h –% · 7d –%`);
  assert.equal(line(payload(100_000)), `${B} ${R}100.0k (10.0%)${Z} · 5h –% · 7d –%`);
});

test('window smaller than the budget caps L', () => {
  const p = { context_window: { total_input_tokens: 48_000, context_window_size: 80_000 } };
  assert.equal(line(p), `${B} ${Y}48.0k (60.0%)${Z} · 5h –% · 7d –%`);
});

test('missing window size uses used_percentage and the budget', () => {
  const p = { context_window: { total_input_tokens: 45_600, used_percentage: 46 } };
  assert.equal(line(p), `${B} ${G}45.6k (46.0%)${Z} · 5h –% · 7d –%`);
});

test('limits are uncolored and cache fills a missing payload', () => {
  const limits = { five_hour: { resets_at: SEC + 9960 - 1, used_percentage: 6 }, seven_day: { used_percentage: 75 } };
  assert.equal(line(payload(45_600, { rate_limits: limits })), `${B} ${G}45.6k (4.6%)${Z} · 2h 46m 6% · 7d 75%`);
  const cache = { cached_at: SEC - 100, five_hour: { resets_at: SEC + 2400, used_percentage: 9 }, seven_day: { resets_at: null, used_percentage: 80 } };
  assert.equal(line(payload(45_600), { cache }), `${B} ${G}45.6k (4.6%)${Z} · 40m 9% · 7d 80%`);
});

test('expired cache falls back', () => {
  const cache = { cached_at: SEC - 13 * 3600, five_hour: { resets_at: SEC - 5, used_percentage: 9 }, seven_day: { resets_at: null, used_percentage: 80 } };
  assert.equal(line(payload(45_600), { cache }), `${B} ${G}45.6k (4.6%)${Z} · 5h –% · 7d –%`);
});

test('model trim and effort ladder', () => {
  const p = payload(45_600, { model: { display_name: 'Opus 5 (1M context)' }, effort: { level: 'High' } });
  assert.equal(line(p), `${B} ${G}45.6k (4.6%)${Z} · 5h –% · 7d –% · Opus 5 \x1b[38;5;33mhigh${Z}`);
  assert.equal(line(payload(1, { effort: { level: 'bogus' } })), `${B} ${G}0.0k (0.0%)${Z} · 5h –% · 7d –% · bogus`);
  assert.equal(line(payload(1)), `${B} ${G}0.0k (0.0%)${Z} · 5h –% · 7d –%`);
});

test('NO_COLOR drops every SGR code', () => {
  const p = payload(45_600, { model: { display_name: 'Opus 5' }, effort: { level: 'high' } });
  assert.equal(line(p, { env: { ...env, NO_COLOR: '1' } }), 'exo 45.6k (4.6%) · 5h –% · 7d –% · Opus 5 high');
});

test('control characters are stripped from model name', () => {
  assert.equal(line(payload(1, { model: { display_name: 'Op\x1b[31mus' } })), `${B} ${G}0.0k (0.0%)${Z} · 5h –% · 7d –% · Op[31mus`);
});

test('transcript token count wins over the payload count', () => {
  const transcript = path.join(home, 'transcript.jsonl');
  const usage = { input_tokens: 1000, cache_read_input_tokens: 70_000, cache_creation_input_tokens: 6000 };
  fs.writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 5 } } })}\n${JSON.stringify({ type: 'assistant', message: { usage } })}\n`);
  assert.equal(line(payload(5000, { transcript_path: transcript })), `${B} ${Y}77.0k (7.7%)${Z} · 5h –% · 7d –%`);
});

test('cacheUpdate stores only fresh windows', () => {
  assert.equal(cacheUpdate({}, null, NOW), null);
  const u = cacheUpdate({ rate_limits: { five_hour: { resets_at: SEC + 60, used_percentage: 3 } } }, null, NOW);
  assert.deepEqual(u, { cached_at: SEC, five_hour: { resets_at: SEC + 60, used_percentage: 3 }, seven_day: null });
});

test('main prints a line for malformed stdin and exits 0', () => {
  const r = spawnSync(process.execPath, ['-e', "import('./lib/statusline.mjs').then((m) => m.main())"], {
    input: '{not json', encoding: 'utf8', env: { ...process.env, HOME: home, XDG_CACHE_HOME: path.join(home, 'cache'), NO_COLOR: '1' },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'exo 0.0k · 5h –% · 7d –%');
});

test('main writes the cache atomically from rate_limits', () => {
  const cache = path.join(home, 'cache2');
  const input = JSON.stringify(payload(1, { rate_limits: { seven_day: { used_percentage: 12 } } }));
  spawnSync(process.execPath, ['-e', "import('./lib/statusline.mjs').then((m) => m.main())"], {
    input, encoding: 'utf8', env: { ...process.env, HOME: home, XDG_CACHE_HOME: cache },
  });
  const saved = JSON.parse(fs.readFileSync(path.join(cache, 'exo', 'statusline-rate-limits.json'), 'utf8'));
  assert.equal(saved.seven_day.used_percentage, 12);
  assert.deepEqual(fs.readdirSync(path.join(cache, 'exo')), ['statusline-rate-limits.json']);
});
