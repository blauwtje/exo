import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import './watch-gate-env.mjs';
import { tempDir } from './harness.mjs';
import { viewsPerDay } from '../skills/watch/scripts/search.mjs';

const script = path.resolve('skills/watch/scripts/search.mjs');

const FAKE_YT_DLP = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
if (args.includes('--version')) { console.log('2025.01.01'); process.exit(0); }
const reply = JSON.parse(fs.readFileSync(process.env.FAKE_REPLY, 'utf8'));
if (reply.error) { console.error(reply.error); process.exit(1); }
for (const entry of reply.entries) console.log(JSON.stringify(entry));
`;

const VIDEO = { id: 'abc', webpage_url: 'https://www.youtube.com/watch?v=abc', title: 'Skills tour', timestamp: 1735689600, duration: 65, view_count: 1200 };

function site(reply) {
  const dir = tempDir('exo-search-');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'yt-dlp'), FAKE_YT_DLP, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'reply.json'), JSON.stringify(reply));
  const env = { PATH: bin, CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA, EXO_WATCH_GATE_MS: '0', EXO_WATCH_BACKOFF_MS: '0', FAKE_LOG: path.join(dir, 'calls.log'), FAKE_REPLY: path.join(dir, 'reply.json') };
  const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
  const searchCall = () => fs.readFileSync(env.FAKE_LOG, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).find((call) => call.includes('--dump-json'));
  return { run, searchCall };
}

test('prints id, url, title, date, duration, views and views per day', () => {
  const { run } = site({ entries: [VIDEO] });
  const result = run(['--query', 'skills']);
  assert.equal(result.status, 0);
  const line = result.stdout.trimEnd();
  assert.match(line, /^abc \| https:\/\/www\.youtube\.com\/watch\?v=abc \| Skills tour \| 2025-01-01 \| 0:01:05 \| 1200 views \| \d+ views\/day$/);
});

test('asks for ytsearchN, or ytsearchdateN with --newest', () => {
  const first = site({ entries: [VIDEO] });
  first.run(['--query', 'skills', '--limit', '3']);
  assert.equal(first.searchCall().at(-1), 'ytsearch3:skills');
  const second = site({ entries: [VIDEO] });
  second.run(['--query', 'skills', '--limit', '2', '--newest']);
  assert.equal(second.searchCall().at(-1), 'ytsearchdate2:skills');
});

test('views per day divides views by whole days since upload, at least one day', () => {
  const day = 86400;
  assert.equal(viewsPerDay({ timestamp: 0, view_count: 1000 }, 10 * day * 1000), 100);
  assert.equal(viewsPerDay({ timestamp: 0, view_count: 50 }, 1000), 50);
  assert.equal(viewsPerDay({ view_count: 50 }, 1000), null);
});

test('reports a search with no videos as a failure', () => {
  const result = site({ entries: [] }).run(['--query', 'nothing']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no videos/);
});

test('a missing query is a usage error', () => {
  assert.equal(site({ entries: [] }).run([]).status, 2);
});
