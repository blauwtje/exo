import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gateRequest } from '../../watch/scripts/request-gate.mjs';
import { cookieHeader, confirmStep } from './age-gate.mjs';
import { waybackSnapshot } from './archive.mjs';
import { BlockedPage, blockReason } from './block-detect.mjs';
import { renderWithBrowser } from './browser-render.mjs';
import { khorosFeedText } from './khoros-feed.mjs';
import { appendMetric } from './search.mjs';
import { BlockedRoute } from './sources/http.mjs';
import { createHostState } from './sources/host-state.mjs';
import { pageRoute } from './sources/pages.mjs';
import { pageText } from './page-text.mjs';
import { excludeScratchIfGit, pagePath, recordSource } from './ledger.mjs';

const USER_AGENT = 'Mozilla/5.0 (compatible; exo-research)';

async function load(url, context, init = {}) {
  await gateRequest(url, context.gate);
  const headers = { 'user-agent': USER_AGENT, ...init.headers };
  const response = await context.fetchImpl(url, { redirect: 'follow', ...init, headers });
  const html = await response.text();
  const text = pageText(html, response.headers.get('content-type'));
  return { status: response.status, headers: response.headers, html, text, url: response.url || url };
}


async function followAgeGate(first, context) {
  const step = confirmStep(first.html, first.url);
  if (!step) return null;
  const cookie = cookieHeader(first.headers);
  const headers = { ...step.init.headers, ...(cookie ? { cookie } : {}) };
  return load(step.url, context, { ...step.init, headers });
}

async function viaArchive(url, context) {
  const snapshot = await waybackSnapshot(url, { ...context, headers: { 'user-agent': USER_AGENT } });
  if (!snapshot) return null;
  const text = pageText(snapshot.html, snapshot.response.headers.get('content-type'));
  const page = { status: 200, headers: snapshot.response.headers, html: snapshot.html, text };
  if (blockReason(page)) return null;
  return { text, via: `archived ${snapshot.date}` };
}

async function viaFeed(url, context) {
  const text = await khorosFeedText(url, { ...context, headers: { 'user-agent': USER_AGENT } });
  return text ? { text, via: 'feed' } : null;
}

async function viaBrowser(url, context) {
  const html = await context.render(url);
  if (!html) return null;
  const text = pageText(html, 'text/html');
  if (blockReason({ status: 200, headers: new Headers(), html, text })) return null;
  return { text, via: 'browser' };
}

async function recover(url, context) {
  for (const route of [viaArchive, viaFeed, viaBrowser]) {
    const found = await route(url, context);
    if (found) return found;
  }
  return null;
}

function blockedPage(reason, runDir, url) {
  createHostState({ dir: runDir }).recordBlocked(url);
  return new BlockedPage(reason, runDir, url);
}

async function routed(route, row, context, runDir) {
  try {
    return { text: await route.fetchText(row.url, context), via: route.name };
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    const reason = /not public/.test(error.message) ? 'not-public' : error.message;
    throw blockedPage(reason, runDir, row.url);
  }
}

async function direct(row, context, runDir) {
  const first = await load(row.url, context);
  let page = first;
  let reason = blockReason(first);
  if (reason === 'age-gate') {
    page = (await followAgeGate(first, context)) ?? first;
    reason = blockReason(page);
  }
  if (!reason && page.status >= 400) throw new Error(`HTTP ${page.status} for ${row.url}`);
  if (!reason) return { text: page.text, via: 'fetched' };
  const found = await recover(row.url, context);
  if (found) return found;
  throw blockedPage(reason, runDir, row.url);
}

export async function fetchPage(url, options) {
  const { runDir, fetchImpl = fetch, gate = {}, render = renderWithBrowser } = options;
  const row = recordSource(runDir, { url, fields: {} });
  const file = pagePath(runDir, row.ref);
  if (fs.existsSync(file)) return { ...row, file, cached: true };
  const context = { fetchImpl, gate, render, stateDir: runDir };
  const route = pageRoute(url);
  const found = route ? await routed(route, { ...row, url }, context, runDir) : await direct(row, context, runDir);
  if (found.text === '') throw blockedPage('empty', runDir, row.url);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${found.text}\n`);
  return { ...row, file, cached: false, via: found.via };
}

export async function savePageText(url, text, options) {
  const row = recordSource(options.runDir, { url, fields: {} });
  const file = pagePath(options.runDir, row.ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text.trim()}\n`);
  return { ...row, file, cached: false };
}

async function fetchOne(url, options) {
  const started = Date.now();
  try {
    const page = await fetchPage(url, options);
    appendMetric(options.runDir, { tool: 'fetch', url, ms: Date.now() - started, ok: true });
    return `${page.ref}\t${page.url}\t${page.cached ? 'cached' : page.via}`;
  } catch (error) {
    appendMetric(options.runDir, { tool: 'fetch', url, ms: Date.now() - started, ok: false, error: error.message });
    return { failure: `${url}\t${error.message}` };
  }
}

export async function fetchMany(urls, options) {
  const outcomes = await Promise.all(urls.map((url) => fetchOne(url, options)));
  const lines = outcomes.map((outcome) => outcome.failure ?? outcome);
  const failures = outcomes.flatMap((outcome) => outcome.failure ?? []);
  return { lines, failures, failed: failures.length === urls.length };
}

async function saveFromStdin(runDir, url) {
  const page = await savePageText(url, fs.readFileSync(0, 'utf8'), { runDir });
  process.stdout.write(`${page.ref}\t${page.url}\tsaved\n`);
}

async function main(argv) {
  excludeScratchIfGit(process.cwd());
  if (argv[0] === '--save' && argv.length === 3) return saveFromStdin(argv[1], argv[2]);
  const [runDir, ...urls] = argv;
  if (!runDir || urls.length === 0) {
    process.stderr.write('usage: fetch.mjs <run-dir> <url>... | fetch.mjs --save <run-dir> <url> < text\n');
    process.exitCode = 2;
    return;
  }
  const { lines, failed } = await fetchMany(urls, { runDir });
  for (const line of lines) process.stdout.write(`${line}\n`);
  if (failed) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) await main(process.argv.slice(2));
