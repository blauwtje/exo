import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { notifyRun } from '../skills/build/scripts/notify.mjs';
import { tempDir } from './harness.mjs';

let savedPath;

before(() => {
  savedPath = process.env.PATH;
  process.env.PATH = tempDir('exo-notify-bin-');
});

after(() => {
  process.env.PATH = savedPath;
});

function listener() {
  const posts = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      posts.push({ method: request.method, body });
      response.end('ok');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, posts, url: `http://127.0.0.1:${server.address().port}/topic` })));
}

function projectWith(url) {
  const root = tempDir('exo-notify-');
  fs.mkdirSync(path.join(root, '.claude'));
  fs.writeFileSync(path.join(root, '.claude', 'exo.local.json'), JSON.stringify({ notify: url }));
  return root;
}

test('a done run and a stuck task each post one line with the plan and the phase', async () => {
  const { server, posts, url } = await listener();
  const root = projectWith(url);
  const state = { id: '20261106T101500-ab12', plan: '/repo/docs/specs/2026-11-06-sample-plan.md' };
  await notifyRun(root, state, 'landed', null);
  await notifyRun(root, state, 'stopped', 'Task 3 is blocked: PLAN DRIFT');
  await notifyRun(root, state, 'parked', null);
  server.close();
  assert.equal(posts.length, 3);
  assert.ok(posts.every((post) => post.method === 'POST' && !post.body.includes('\n')));
  assert.equal(posts[0].body, 'exo 2026-11-06-sample-plan: done (landed)');
  assert.equal(posts[1].body, 'exo 2026-11-06-sample-plan: stuck at task 3');
  assert.equal(posts[2].body, `exo 2026-11-06-sample-plan: question raised, run ${state.id} parked`);
});

test('an unset notify posts nothing and a refused run posts nothing', async () => {
  const { server, posts, url } = await listener();
  await notifyRun(projectWith(''), { id: 'r1', plan: 'p.md' }, 'landed', null);
  await notifyRun(projectWith(url), { id: 'r1', plan: 'p.md' }, 'refused', 'x');
  server.close();
  assert.deepEqual(posts, []);
});

test('a failed post logs one line and does not throw', async () => {
  const { server, url } = await listener();
  server.close();
  const written = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => { written.push(String(chunk)); return true; };
  try {
    await notifyRun(projectWith(url), { id: 'r1', plan: 'p.md' }, 'landed', null);
  } finally {
    process.stderr.write = original;
  }
  assert.equal(written.length, 1);
  assert.match(written[0], /^exo: notify not sent: /);
});
