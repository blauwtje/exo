import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pageRoute } from '../skills/spec/scripts/sources/pages.mjs';
import { BlockedRoute } from '../skills/spec/scripts/sources/http.mjs';

const SHEET = 'https://docs.google.com/spreadsheets/d/abc123';

function gate() {
  return { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'page-gate-')), spacingMs: 0 };
}

function context(answers, calls = []) {
  return {
    gate: gate(),
    fetchImpl: async (url) => {
      calls.push(url);
      const answer = answers.shift();
      return new Response(answer.body, { status: answer.status ?? 200, headers: answer.headers });
    },
  };
}

test('non-matching urls have no route', () => {
  assert.equal(pageRoute('https://example.com/a'), null);
  assert.equal(pageRoute('https://forums.ea.com/discussions/x/y/1'), null);
});

test('sheet url with gid in hash becomes a csv export', async () => {
  const calls = [];
  const url = `${SHEET}/edit#gid=77`;
  const route = pageRoute(url);
  assert.equal(route.name, 'google-sheets');
  const text = await route.fetchText(url, context([{ body: 'a,b\n1,2' }], calls));
  assert.equal(text, 'a,b\n1,2');
  assert.deepEqual(calls, [`${SHEET}/export?format=csv&gid=77`]);
});

test('sheet url with gid in query works for pubhtml', async () => {
  const calls = [];
  const url = `${SHEET}/pubhtml?gid=5&single=true`;
  await pageRoute(url).fetchText(url, context([{ body: 'x' }], calls));
  assert.deepEqual(calls, [`${SHEET}/export?format=csv&gid=5`]);
});

test('sheet without gid defaults to gid 0', async () => {
  const calls = [];
  const url = `${SHEET}/view`;
  await pageRoute(url).fetchText(url, context([{ body: 'x' }], calls));
  assert.deepEqual(calls, [`${SHEET}/export?format=csv&gid=0`]);
});

test('gviz is tried when the export route fails', async () => {
  const calls = [];
  const url = `${SHEET}/htmlview#gid=3`;
  const text = await pageRoute(url).fetchText(url, context([{ body: 'no', status: 404 }, { body: 'k,v' }], calls));
  assert.equal(text, 'k,v');
  assert.equal(calls[1], `${SHEET}/gviz/tq?tqx=out:csv&gid=3`);
});

test('a login html answer is blocked as not public', async () => {
  const url = `${SHEET}/edit#gid=1`;
  const html = { body: '<!DOCTYPE html><html>Sign in</html>', headers: { 'content-type': 'text/html' } };
  await assert.rejects(
    pageRoute(url).fetchText(url, context([html, html])),
    (error) => error instanceof BlockedRoute && error.message === 'sheet is not public',
  );
});

test('a redirect to accounts.google.com is blocked as not public', async () => {
  const url = `${SHEET}/edit#gid=1`;
  const ctx = {
    gate: gate(),
    fetchImpl: async () => {
      const response = new Response('x', { status: 200, headers: { 'content-type': 'text/csv' } });
      Object.defineProperty(response, 'url', { value: 'https://accounts.google.com/ServiceLogin' });
      return response;
    },
  };
  await assert.rejects(pageRoute(url).fetchText(url, ctx), (error) => error.message === 'sheet is not public');
});
