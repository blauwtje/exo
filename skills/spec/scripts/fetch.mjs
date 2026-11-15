import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { limitLifetime } from '#lifetime';
import { USAGE_EXIT } from '#script-flags';
import { gateRequest } from '../../watch/scripts/request-gate.mjs';
import { appendMetric } from './search.mjs';
import { BlockedRoute, USER_AGENT } from './sources/http.mjs';
import { createHostState } from './sources/host-state.mjs';
import { pageRoute } from './sources/pages.mjs';
import { htmlToText, pageText } from './page-text.mjs';
import { excludeScratchIfGit, pagePath, recordSource } from './ledger.mjs';

const CONFIRM_TEXT = /^\s*(enter|i am (over )?18\+?|i'm (over )?18\+?|yes|i agree|confirm|continue)\b/i;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
const FORM = /<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi;
const INPUT = /<input\b([^>]*)>/gi;
const BUTTON = /<(?:button|input)\b([^>]*)>([\s\S]*?)(?=<\/button|<|$)/gi;

function attr(source, name) {
  const found = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(source);
  return found ? (found[2] ?? found[3]) : null;
}

function plain(markup) {
  return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sameOrigin(href, base) {
  const resolved = href.replace(/&amp;/g, '&');
  if (!URL.canParse(resolved, base)) return null;
  const target = new URL(resolved, base);
  if (target.origin !== new URL(base).origin) return null;
  if (!/^https?:$/.test(target.protocol)) return null;
  return target;
}

function linkStep(html, base) {
  for (const [, attrs, inner] of html.matchAll(ANCHOR)) {
    const href = attr(attrs, 'href');
    if (!href || href.startsWith('#') || !CONFIRM_TEXT.test(plain(inner))) continue;
    const target = sameOrigin(href, base);
    if (target) return { url: target.href, init: {} };
  }
  return null;
}

function hasConfirmButton(inner) {
  for (const [, attrs, text] of inner.matchAll(BUTTON)) {
    if (CONFIRM_TEXT.test(plain(text)) || CONFIRM_TEXT.test(attr(attrs, 'value') ?? '')) return true;
  }
  return false;
}

function hiddenFields(formHtml) {
  const fields = new URLSearchParams();
  for (const [, inputAttrs] of formHtml.matchAll(INPUT)) {
    const name = attr(inputAttrs, 'name');
    if (name && /hidden/i.test(attr(inputAttrs, 'type') ?? '')) fields.append(name, attr(inputAttrs, 'value') ?? '');
  }
  return fields;
}

function formStep(html, base) {
  for (const [, attrs, inner] of html.matchAll(FORM)) {
    if (!hasConfirmButton(inner)) continue;
    const target = sameOrigin(attr(attrs, 'action') || base, base);
    if (!target) continue;
    const fields = hiddenFields(inner);
    if (/post/i.test(attr(attrs, 'method') ?? '')) {
      return { url: target.href, init: { method: 'POST', body: fields.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } } };
    }
    fields.forEach((value, name) => target.searchParams.set(name, value));
    return { url: target.href, init: {} };
  }
  return null;
}

function confirmStep(html, base) {
  return linkStep(html, base) ?? formStep(html, base);
}

function cookieHeader(headers) {
  const lines = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  return lines.map((line) => line.split(';')[0]).join('; ');
}


const AVAILABLE = 'https://archive.org/wayback/available?url=';

function snapshotDate(timestamp) {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

async function get(url, { fetchImpl, gate, headers }) {
  await gateRequest(url, gate);
  const response = await fetchImpl(url, { headers, redirect: 'follow' });
  return response.ok ? response : null;
}

function nullForBadJson(error) {
  if (!(error instanceof SyntaxError)) throw error;
  return null;
}

async function closestTimestamp(url, context) {
  const response = await get(`${AVAILABLE}${encodeURIComponent(url)}`, context);
  if (!response) return null;
  const body = await response.json().catch(nullForBadJson);
  const closest = body?.archived_snapshots?.closest;
  if (!closest?.available || !/^\d{8,14}$/.test(closest.timestamp ?? '')) return null;
  return closest.timestamp;
}

async function waybackSnapshot(url, context) {
  const timestamp = await closestTimestamp(url, context);
  if (!timestamp) return null;
  const response = await get(`https://web.archive.org/web/${timestamp}id_/${url}`, context);
  if (!response) return null;
  return { response, html: await response.text(), date: snapshotDate(timestamp) };
}

const CHALLENGE_STATUS = new Set([403, 429, 503]);
const CHALLENGE_BODY = /<title>\s*just a moment|cf-chl|verification successful|checking your browser/i;
const AGE_MARKER = /\b18\s*\+|are you (over|at least|older)|age verification|verify your age|over (the age of )?18|adults? only|adult content/i;
const ENTER_WORD = /\b(enter|i am (over )?18|i'm (over )?18|yes)\b/i;
const GATE_TEXT_LIMIT = 1500;
const CHALLENGE_TEXT_LIMIT = 4000;

function isCloudflare(headers) {
  return Boolean(headers.get('cf-mitigated')) || /cloudflare/i.test(headers.get('server') ?? '');
}

function blockReason({ status, headers, html, text }) {
  if (CHALLENGE_STATUS.has(status) && isCloudflare(headers)) return 'challenge';
  if (CHALLENGE_BODY.test(html) && text.length < CHALLENGE_TEXT_LIMIT) return 'challenge';
  if (status === 401 || status === 403) return 'not-public';
  if (status >= 400) return null;
  if (text === '') return 'empty';
  if (text.length < GATE_TEXT_LIMIT && AGE_MARKER.test(text) && ENTER_WORD.test(text)) return 'age-gate';
  return null;
}

class BlockedPage extends Error {
  constructor(reason, runDir, url) {
    super(`status: blocked ${reason}; open it in your browser and save the text with: node fetch.mjs --save ${runDir} ${url} < text`);
    this.reason = reason;
  }
}


const NAVIGATION_MS = 30000;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

async function renderWithBrowser(url) {
  const playwright = await loadPlaywright();
  if (!playwright) return null;
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(url, { timeout: NAVIGATION_MS, waitUntil: 'networkidle' });
    return await page.content();
  } finally {
    await browser.close();
  }
}


const THREAD = /^\/discussions\/([\w-]+)\/[^/]+\/(\d+)\/?$/;
const ITEM = /<item>([\s\S]*?)<\/item>/gi;

function decodeCdata(value) {
  return value.replace(/^<!\[CDATA\[|\]\]>$/g, '');
}

function tag(item, name) {
  const found = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(item);
  return found ? decodeCdata(found[1].trim()) : '';
}

function feedUrl(url) {
  const parsed = new URL(url);
  const match = THREAD.exec(parsed.pathname);
  if (!match) return null;
  return { feed: `${parsed.origin}/t5/s/rss/board?board.id=${match[1]}`, id: match[2] };
}

function itemText(item) {
  const title = tag(item, 'title');
  const body = htmlToText(tag(item, 'description').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  return `${title}\n${body}`.trim();
}

async function khorosFeedText(url, { fetchImpl, gate, headers }) {
  const target = feedUrl(url);
  if (!target) return null;
  await gateRequest(target.feed, gate);
  const response = await fetchImpl(target.feed, { headers, redirect: 'follow' });
  if (!response.ok) return null;
  const xml = await response.text();
  const wanted = new RegExp(`[/#]${target.id}\\b|/m-p/${target.id}\\b`);
  for (const [, item] of xml.matchAll(ITEM)) {
    if (wanted.test(item)) return itemText(item);
  }
  return null;
}

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

async function routed(route, row, context) {
  try {
    return { text: await route.fetchText(row.url, context), via: route.name };
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    const reason = /not public/.test(error.message) ? 'not-public' : error.message;
    throw blockedPage(reason, context.stateDir, row.url);
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

async function fetchPage(url, options) {
  const { runDir, fetchImpl = fetch, gate = {}, render = renderWithBrowser } = options;
  const row = recordSource(runDir, { url, fields: {} });
  const file = pagePath(runDir, row.ref);
  if (fs.existsSync(file)) return { ...row, file, cached: true };
  const context = { fetchImpl, gate, render, stateDir: runDir };
  const route = pageRoute(url);
  const found = route ? await routed(route, { ...row, url }, context) : await direct(row, context, runDir);
  if (found.text === '') throw blockedPage('empty', runDir, row.url);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, found.text.endsWith('\n') ? found.text : `${found.text}\n`);
  return { ...row, file, cached: false, via: found.via };
}

async function fetchOne(url, options) {
  const started = Date.now();
  try {
    const page = await fetchPage(url, options);
    appendMetric(options.runDir, { tool: 'fetch', url, ms: Date.now() - started, ok: true });
    const line = `${page.ref}\t${page.url}\t${page.cached ? 'cached' : page.via}`;
    return pageRoute(page.url)?.name === 'github-readme' ? `${line}\t${page.file}\t${fs.statSync(page.file).size}` : line;
  } catch (error) {
    appendMetric(options.runDir, { tool: 'fetch', url, ms: Date.now() - started, ok: false, error: error.message });
    return { failure: `${url}\t${error.message}` };
  }
}

async function fetchMany(urls, options) {
  const outcomes = await Promise.all(urls.map((url) => fetchOne(url, options)));
  const lines = outcomes.map((outcome) => outcome.failure ?? outcome);
  const failures = outcomes.flatMap((outcome) => outcome.failure ?? []);
  return { lines, failures, failed: failures.length === urls.length };
}

function saveFromStdin(runDir, url) {
  const row = recordSource(runDir, { url, fields: {} });
  const file = pagePath(runDir, row.ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${fs.readFileSync(0, 'utf8').trim()}\n`);
  process.stdout.write(`${row.ref}\t${row.url}\tsaved\n`);
}

async function main(argv) {
  limitLifetime('spec-fetch', 600000);
  excludeScratchIfGit(process.cwd());
  if (argv[0] === '--save' && argv.length === 3) return saveFromStdin(argv[1], argv[2]);
  const [runDir, ...urls] = argv;
  if (!runDir || urls.length === 0) {
    process.stderr.write('usage: fetch.mjs <run-dir> <url>... | fetch.mjs --save <run-dir> <url> < text\n');
    process.exitCode = USAGE_EXIT;
    return;
  }
  const { lines, failed } = await fetchMany(urls, { runDir });
  for (const line of lines) process.stdout.write(`${line}\n`);
  if (failed) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) await main(process.argv.slice(2));
