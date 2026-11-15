import os from 'node:os';
import process from 'node:process';
import { sleep as pauseNow } from '#basics';
import { environmentMs } from '#script-flags';
import { lifetimeMs, SPEC_SEARCH_LIFETIME_MS } from '#lifetime';
import { runDefaults } from '../../../build/scripts/run-config.mjs';
import { ENTITIES } from '../page-text.mjs';
import { BlockedRoute } from './http.mjs';
import { createHostState } from './host-state.mjs';
import { pageFetch } from './reddit-browser.mjs';

const WAIT_CAP_MS = 65_000;
const THREAD_MS = 45_000;
const THREAD_PATH = /\/(?:r\/(\w+)\/)?(?:comments|posts)\/(\w+)/;

function settingsOf(context) {
  const configured = context.defaults ?? runDefaults(os.homedir()).reddit ?? {};
  return { concurrency: 3, capacity: 3, refillMs: 400, waitCapMs: WAIT_CAP_MS, threadMs: environmentMs('EXO_REDDIT_THREAD_MS', THREAD_MS), now: context.now ?? Date.now, ...configured };
}

function splitSubreddit(query, subreddit) {
  const inline = query.match(/(?:^|\s)r\/(\w+)/);
  if (!inline) return { subreddit, text: query };
  const text = query.replace(inline[0], ' ').replace(/\s+/g, ' ').trim();
  return { subreddit: subreddit || inline[1], text };
}

async function searchHits(client, { query, limit, subreddit, sort = 'new', time = 'all' }) {
  const target = splitSubreddit(query, subreddit);
  const page = await client.get(searchUrl({ query: target.text, sort, time, subreddit: target.subreddit }));
  return parseSearchPage(page).slice(0, limit).map(({ title, url }) => ({ title, url, date: '', text: '' }));
}

function hitFromUrl(url) {
  const slug = url.match(/\/(?:comments|posts)\/\w+\/([^/?#]+)/)?.[1] ?? '';
  return { title: slug.replace(/_/g, ' '), url, date: '', text: '' };
}

function threadUrl(id, commentId = '') {
  const path = commentId ? `/comments/${id}/_/${commentId}` : `/comments/${id}`;
  return `https://www.reddit.com${path}.json?limit=500&depth=10&sort=top&raw_json=1`;
}

const BATCH = 100;
const MORE_URL = 'https://www.reddit.com/api/morechildren.json?api_type=json&limit_children=false&raw_json=1';

function moreChildrenUrl(id, children) {
  return `${MORE_URL}&link_id=t3_${id}&children=${children.join(',')}`;
}

function addStubs(state, stubs) {
  for (const { children, parentId } of stubs) {
    if (children.length > 0) state.ids.push(...children);
    if (children.length === 0 && !parentId.startsWith('t3_')) state.parents.push(parentId.replace(/^t\d_/, ''));
  }
}

function addComments(state, part) {
  const fresh = part.comments.filter((comment) => !state.seen.has(comment.id));
  fresh.forEach((comment) => state.seen.add(comment.id));
  state.comments.push(...fresh);
  addStubs(state, part.more);
}

async function readBatch(client, { id, wait }, state) {
  const ids = state.ids.splice(0, BATCH);
  try {
    addComments(state, parseMoreChildren(JSON.parse(await client.get(moreChildrenUrl(id, ids), { wait })), id));
  } catch (error) {
    if (!(error instanceof BlockedRoute || error instanceof SyntaxError)) throw error;
    state.ids.unshift(...ids);
    state.single = true;
  }
}

async function readSingle(client, { id, wait }, state) {
  const queue = state.ids.length > 0 ? state.ids : state.parents;
  try {
    addComments(state, parseThread(JSON.parse(await client.get(threadUrl(id, queue[0]), { wait }))));
    queue.shift();
  } catch (error) {
    state.stopped = error.message;
  }
}

async function readThread(client, id, { wait, budgetMs, now }) {
  const { post, comments, more } = parseThread(JSON.parse(await client.get(threadUrl(id), { wait })));
  const state = { comments, seen: new Set(comments.map((comment) => comment.id)), ids: [], parents: [], single: false };
  addStubs(state, more);
  const deadline = now() + budgetMs;
  while (!state.stopped && now() < deadline && state.ids.length + state.parents.length > 0) {
    const read = state.ids.length > 0 && !state.single ? readBatch : readSingle;
    await read(client, { id, wait }, state);
  }
  return { post, comments, unread: state.ids.length + state.parents.length, truncated: state.stopped };
}

function signalsOf({ post, comments, truncated, unread }) {
  const read = `read ${comments.length} of ${post.commentCount} comments`;
  const rest = unread > 0 ? `${read}; ${unread} ids unread` : read;
  return truncated ? `${rest}; truncated: ${truncated}` : rest;
}

async function withComments(client, hit, settings) {
  const id = hit.url.match(THREAD_PATH)?.[2];
  if (!id) return hit;
  const wait = threadWait(client.capMs, client.pauseFor);
  const read = await readThread(client, id, { wait, budgetMs: settings.threadMs, now: settings.now });
  return { ...hit, title: read.post.title, text: read.post.text, comments: commentsAsText(read.comments), signals: signalsOf(read) };
}

async function readThreads(client, hits, { settings, limit: callLimit }) {
  const limit = Math.min(callLimit ?? hits.length, hits.length);
  const rows = hits.map((hit, index) => (index < limit ? hit : { ...hit, signals: 'not read: over the search limit' }));
  let next = 0;
  async function work() {
    while (next < limit) {
      const index = next;
      next += 1;
      rows[index] = await withComments(client, hits[index], settings);
    }
  }
  await Promise.all(Array.from({ length: settings.concurrency }, work));
  return rows;
}

export async function search({ query, limit, subreddit, sort, time, urls = [] }, context) {
  const settings = settingsOf(context);
  const client = createClient(context, settings);
  const hits = urls.length > 0 ? urls.map(hitFromUrl) : await searchHits(client, { query, limit, subreddit, sort, time });
  const rows = await readThreads(client, hits, { settings, limit });
  return rows.map(({ text, ...row }) => ({ ...row, description: text }));
}


const HOST = 'reddit.com';

function searchLimitMs() {
  return lifetimeMs('spec-search', SPEC_SEARCH_LIFETIME_MS);
}

function createBucket({ capacity, refillMs, now, sleep, hostState, host, maxWaitMs }) {
  const state = { tokens: capacity, checkedAt: now() };

  function refill() {
    const elapsed = now() - state.checkedAt;
    state.checkedAt += elapsed;
    state.tokens = Math.min(capacity, state.tokens + elapsed / refillMs);
  }

  async function pauseFor(ms, pause) {
    if (ms > maxWaitMs) throw new BlockedRoute(`rate limit wait of ${ms} ms is over the ${maxWaitMs} ms cap`);
    await (pause ?? sleep)(ms);
  }

  async function take(pause) {
    const shared = hostState ? hostState.budgetWaitMs(host) : 0;
    if (shared > 0) await pauseFor(shared, pause);
    refill();
    if (state.tokens >= 1) {
      state.tokens -= 1;
      return;
    }
    await pauseFor(Math.ceil((1 - state.tokens) * refillMs), pause);
    return take(pause);
  }

  return { take };
}

function threadWait(totalMs, pauseFor) {
  const wait = { leftMs: totalMs };
  wait.pause = async (ms) => {
    if (ms > wait.leftMs) throw new BlockedRoute(`thread wait of ${ms} ms is over the ${wait.leftMs} ms left for this thread`);
    wait.leftMs -= ms;
    await pauseFor(ms);
  };
  return wait;
}

function endpointOf(url) {
  return /\/svc\/shreddit\/(?:r\/\w+\/)?search\//.test(url) ? `${HOST}/search` : `${HOST}/thread`;
}

function createLimits(context, settings) {
  const { sleep: injected = pauseNow, now = Date.now, env = process.env } = context;
  const capMs = environmentMs('EXO_REDDIT_WAIT_MS', settings.waitCapMs, env);
  const budget = { leftMs: searchLimitMs() - capMs };
  const sleep = async (ms) => {
    if (ms > budget.leftMs) throw new BlockedRoute(`search wait of ${ms} ms is over the ${budget.leftMs} ms left before the ${searchLimitMs()} ms search limit`);
    budget.leftMs -= ms;
    await injected(ms);
  };
  const hostState = context.stateDir ? createHostState({ dir: context.stateDir, now, env }) : null;
  const buckets = new Map();
  const bucketFor = (endpoint) => {
    const options = { capacity: settings.capacity, refillMs: settings.refillMs, now, sleep, hostState, host: endpoint, maxWaitMs: capMs };
    if (!buckets.has(endpoint)) buckets.set(endpoint, createBucket(options));
    return buckets.get(endpoint);
  };
  return { capMs, hostState, bucketFor, now, pauseFor: sleep };
}

async function request({ limits, read }, url, { wait } = {}) {
  const endpoint = endpointOf(url);
  if (limits.hostState?.isOpen(endpoint)) throw new BlockedRoute(`host breaker is open for ${endpoint} after repeated 429 or 5xx`);
  await limits.bucketFor(endpoint).take(wait?.pause);
  const { status, text } = await read(url);
  limits.hostState?.recordStatus(endpoint, status);
  if (status < 200 || status >= 300) throw new BlockedRoute(`HTTP ${status}`);
  return text;
}

export function createClient(context, settings) {
  const read = context.pageFetch ?? pageFetch;
  const limits = createLimits(context, settings);
  const get = (url, options) => request({ limits, read }, url, options);
  return { get, pauseFor: limits.pauseFor, capMs: limits.capMs };
}


const BLOCK_END = /<(?:br|\/p|\/div|\/li)\s*\/?>/gi;

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole;
    const isHex = name[1].toLowerCase() === 'x';
    const code = isHex ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return String.fromCodePoint(code);
  });
}

function htmlToText(html) {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(BLOCK_END, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(stripped)
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n\s*/g, '\n')
    .trim();
}

function commentsAsText(comments) {
  return comments
    .map(({ author, score, depth, text }) => `${author} (score ${score}, depth ${depth}): ${text}`)
    .join('\n');
}

const SEARCH_ORIGIN = 'https://www.reddit.com';

export function searchUrl({ query, sort, time, subreddit }) {
  const base = subreddit ? `/svc/shreddit/r/${subreddit}/search/` : '/svc/shreddit/search/';
  const params = new URLSearchParams({ q: query, type: 'posts', sort, t: time });
  return `${SEARCH_ORIGIN}${base}?${params}`;
}

export function parseSearchPage(html) {
  const hits = new Map();
  const anchors = html.matchAll(/<a\s[^>]*href="(\/r\/([^/"]+)\/comments\/([a-z0-9]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
  for (const [, href, subreddit, id, inner] of anchors) {
    const title = htmlToText(inner);
    if (hits.get(id)?.title || (!title && hits.has(id))) continue;
    hits.set(id, { id, subreddit, url: `${SEARCH_ORIGIN}${decodeEntities(href)}`, title });
  }
  return [...hits.values()];
}

function flattenReplies(children, depth, found) {
  for (const child of children) {
    if (child.kind === 'more') found.more.push(stubOf(child.data));
    if (child.kind !== 't1') continue;
    const { author, score, body, replies } = child.data;
    found.comments.push({ id: child.data.id, author, score, depth, text: body });
    flattenReplies(replies?.data?.children ?? [], depth + 1, found);
  }
}

function stubOf({ children, parent_id: parentId }) {
  return { children, parentId };
}

function parseMoreChildren(body, linkId) {
  const things = body.json?.data?.things;
  if (!Array.isArray(things)) throw new BlockedRoute(`morechildren answer for ${linkId} has no things`);
  const found = { comments: [], more: [] };
  for (const { kind, data: thing } of things) {
    if (kind === 'more') found.more.push(stubOf(thing));
    if (kind === 't1') found.comments.push({ id: thing.id, author: thing.author, score: thing.score, depth: thing.depth ?? 0, text: thing.body });
  }
  return found;
}

export function parseThread(listings) {
  const [postListing, commentListing] = listings;
  const { id, title, selftext, author, score, num_comments: commentCount } = postListing.data.children[0].data;
  const found = { comments: [], more: [] };
  flattenReplies(commentListing.data.children, 0, found);
  return { post: { id, title, text: selftext, author, score, commentCount }, ...found };
}
