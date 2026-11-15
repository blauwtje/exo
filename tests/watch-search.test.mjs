import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import './watch-gate-env.mjs';
import { tempDir } from './harness.mjs';

const script = path.resolve('skills/watch/scripts/search.mjs');

const RENDERER = {
  videoRenderer: {
    videoId: 'abcdefghijk',
    title: { runs: [{ text: 'Skills tour' }] },
    ownerText: { runs: [{ text: 'Exo Channel' }] },
    lengthText: { simpleText: '1:05' },
  },
};

function answer(renderers) {
  return {
    contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: renderers } }] } } } },
  };
}

const STUB = `import fs from 'node:fs';
const plan = JSON.parse(process.env.SEARCH_STUB);
globalThis.fetch = async (url, init) => {
  fs.appendFileSync(plan.calls, JSON.stringify({ url, method: init.method, body: init.body }) + '\\n');
  if (plan.throws) throw new TypeError(plan.throws);
  if (plan.bug) throw new RangeError(plan.bug);
  if (plan.html) return new Response('<html>not json</html>', { status: 200 });
  return new Response(JSON.stringify(plan.body ?? {}), { status: plan.status ?? 200 });
};
`;

function search(plan, args = ['--query', 'skills'], env = {}) {
  const dir = tempDir('watch-search-');
  const stub = path.join(dir, 'stub.mjs');
  const calls = path.join(dir, 'calls.jsonl');
  fs.writeFileSync(stub, STUB);
  const run = spawnSync(process.execPath, ['--import', stub, script, ...args], {
    encoding: 'utf8',
    timeout: 50000,
    env: { ...process.env, ...env, SEARCH_STUB: JSON.stringify({ ...plan, calls }) },
  });
  const sent = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [];
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, sent };
}

const LINE = 'abcdefghijk | https://www.youtube.com/watch?v=abcdefghijk | Skills tour | Exo Channel | 0:01:05';

test('lists id, url, title, channel and duration from an InnerTube answer', () => {
  const result = search({ body: answer([{ adSlotRenderer: {} }, RENDERER]) });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${LINE}\n`);
});

test('posts the plain query keyless to the search endpoint', () => {
  const [call, ...rest] = search({ body: answer([RENDERER]) }).sent;
  assert.equal(rest.length, 0);
  assert.match(call.url, /youtubei\/v1\/search/);
  assert.doesNotMatch(call.url, /key=/);
  assert.equal(call.method, 'POST');
  const body = JSON.parse(call.body);
  assert.equal(body.query, 'skills');
  assert.equal('params' in body, false);
});

test('stops at the limit', () => {
  const many = Array.from({ length: 5 }, () => RENDERER);
  const result = search({ body: answer(many) }, ['--query', 'skills', '--limit', '2']);
  assert.equal(result.stdout.trim().split('\n').length, 2);
});

test('reports no videos and a 429 as failures with their exit codes', () => {
  const empty = search({ body: answer([]) });
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /no videos/);
  const limited = search({ status: 429 });
  assert.match(limited.stderr, /429/);
  assert.equal(limited.status, 75);
  assert.equal(search({ status: 403 }).status, 1);
});

test('a missing query is a usage error', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});

test('adds views and upload date when the renderer carries them and omits them otherwise', () => {
  const counted = { videoRenderer: { ...RENDERER.videoRenderer, viewCountText: { simpleText: '1,234 views' }, publishedTimeText: { simpleText: '2 days ago' } } };
  const result = search({ body: answer([counted, RENDERER]) });
  assert.equal(result.stdout, `${LINE} | 1,234 views | 2 days ago\n${LINE}\n`);
});

test('a non-JSON answer and a network error are failure lines, not throws', () => {
  const html = search({ html: true });
  assert.equal(html.status, 1);
  assert.match(html.stderr, /^search failed: .*not JSON/);
  const down = search({ throws: 'fetch failed' });
  assert.equal(down.status, 1);
  assert.match(down.stderr, /^search failed: .*fetch failed/);
});

test('an error that is not a fetch failure propagates instead of becoming a failure line', () => {
  const broken = search({ bug: 'stub bug' });
  assert.equal(broken.status, 1);
  assert.equal(broken.stderr.trim(), 'stub bug');
});

test('the search POST is paced through the request gate', () => {
  const data = tempDir('watch-search-data-');
  search({ body: answer([RENDERER]) }, ['--query', 'skills'], { CLAUDE_PLUGIN_DATA: data });
  assert.ok(fs.readdirSync(data, { recursive: true }).some((name) => name.endsWith('youtube.com.last')));
});

test('search with an empty PATH spawns nothing', () => {
  const result = search({ body: answer([RENDERER]) }, ['--query', 'skills'], { PATH: '' });
  assert.equal(result.stdout, `${LINE}\n`);
});
