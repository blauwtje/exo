import os from 'node:os';
import process from 'node:process';
import { environmentMs } from '#script-flags';
import { runDefaults } from '../../../build/scripts/run-config.mjs';
import { createBucket } from './reddit-bucket.mjs';
import { BlockedRoute } from './http.mjs';
import { createHostState } from './host-state.mjs';
import { ARCHIVE_LABEL, LIVE_LABEL, readArchiveComments } from './reddit-archive.mjs';
import { commentsAsText, parseComments, parseSearch } from './reddit-text.mjs';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const WAIT_CAP_MS = 15_000;
const FALLBACK_RESET_S = 10;
const FALLBACK = 'pass thread urls from a site:reddit.com web search and never WebFetch reddit.com or a mirror';
const HOST = 'www.reddit.com';

const THREAD_PATH = /\/r\/(\w+)\/comments\/(\w+)/;

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function settingsOf(context) {
  const configured = context.defaults ?? runDefaults(os.homedir()).reddit ?? {};
  return { threads: 5, concurrency: 3, capacity: 3, refillMs: 400, ...configured };
}

function createClient(context, settings) {
  const { fetchImpl = fetch, sleep = sleepFor, now = Date.now, env = process.env } = context;
  const capMs = environmentMs('EXO_REDDIT_WAIT_MS', WAIT_CAP_MS, env);
  const hostState = context.stateDir ? createHostState({ dir: context.stateDir, now, env }) : null;
  const bucket = createBucket({ capacity: settings.capacity, refillMs: settings.refillMs, now, sleep, hostState, host: HOST, maxWaitMs: capMs });

  async function waitForReset(response) {
    const seconds = Number.parseFloat(response.headers.get('x-ratelimit-reset'));
    const waitMs = (Number.isFinite(seconds) ? seconds : FALLBACK_RESET_S) * 1000;
    if (waitMs > capMs) throw new BlockedRoute(`rate limited for ${waitMs} ms, over EXO_REDDIT_WAIT_MS=${capMs}`);
    await sleep(waitMs);
  }

  function recordBudget(response) {
    const remaining = Number.parseFloat(response.headers.get('x-ratelimit-remaining'));
    const seconds = Number.parseFloat(response.headers.get('x-ratelimit-reset'));
    if (!hostState || !Number.isFinite(remaining) || !Number.isFinite(seconds)) return;
    hostState.recordBudget(HOST, { remaining, resetAt: now() + seconds * 1000 });
  }

  async function get(url, canRetry = true) {
    if (hostState?.isOpen(HOST)) throw new BlockedRoute('host breaker is open after repeated 429 or 5xx');
    await bucket.take();
    const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' }, redirect: 'follow' });
    hostState?.recordStatus(HOST, response.status);
    recordBudget(response);
    if (response.status === 429 && canRetry) {
      await waitForReset(response);
      return get(url, false);
    }
    if (response.status === 429) throw new BlockedRoute('HTTP 429');
    if (response.status >= 500) throw new BlockedRoute(`HTTP ${response.status}`);
    if (!response.ok) throw new BlockedRoute(`HTTP ${response.status}`);
    return response.text();
  }

  const hasBudget = () => !hostState || (hostState.budgetWaitMs(HOST) === 0 && !hostState.isOpen(HOST));

  return { get, hasBudget };
}

export function searchUrl(text, limit, subreddit) {
  const query = encodeURIComponent(text);
  if (subreddit) return `https://www.reddit.com/r/${subreddit}/search.rss?q=${query}&restrict_sr=1&limit=${limit}`;
  return `https://www.reddit.com/search.rss?q=${query}&limit=${limit}`;
}

export function splitSubreddit(query, subreddit) {
  const inline = query.match(/(?:^|\s)r\/(\w+)/);
  if (!inline) return { subreddit, text: query };
  const text = query.replace(inline[0], ' ').replace(/\s+/g, ' ').trim();
  return { subreddit: subreddit || inline[1], text };
}

async function searchHits(client, { query, limit, subreddit }) {
  const target = splitSubreddit(query, subreddit);
  if (!client.hasBudget()) throw new BlockedRoute(`no Reddit budget for the RSS search; ${FALLBACK}`);
  try {
    const atom = await client.get(searchUrl(target.text, limit, target.subreddit));
    if (!atom.includes('<feed')) throw new BlockedRoute('answer was not an Atom feed');
    return parseSearch(atom);
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    throw new BlockedRoute(`${error.message}; ${FALLBACK}`);
  }
}

function threadFeedUrl(url) {
  const id = url.match(/\/comments\/(\w+)/)?.[1];
  return id ? `https://www.reddit.com/comments/${id}.rss?limit=1` : '';
}

async function withPost(client, hit) {
  const feedUrl = threadFeedUrl(hit.url);
  if (!feedUrl || !client.hasBudget()) return hit;
  try {
    const [post] = parseSearch(await client.get(feedUrl));
    return post ? { ...hit, title: post.title, date: post.date, text: post.text } : hit;
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    return hit;
  }
}

function hitFromUrl(url) {
  const slug = url.match(/\/comments\/\w+\/([^/?#]+)/)?.[1] ?? '';
  return { title: slug.replace(/_/g, ' '), url, date: '', text: '' };
}

async function hitsFromUrls(client, urls) {
  const [first, ...rest] = urls.map(hitFromUrl);
  return [await withPost(client, first), ...rest];
}

async function withArchive(hit, threadId, { context, reason }) {
  try {
    const comments = await readArchiveComments(threadId, context);
    return { ...hit, comments: commentsAsText(comments), signals: ARCHIVE_LABEL };
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    return { ...hit, blocked: `${reason}; ${error.message}; ${FALLBACK}`, signals: LIVE_LABEL };
  }
}

async function withComments(client, hit, context) {
  const match = hit.url.match(THREAD_PATH);
  if (!match) return hit;
  try {
    const html = await client.get(`https://www.reddit.com/svc/shreddit/comments/r/${match[1]}/t3_${match[2]}`);
    return { ...hit, comments: commentsAsText(parseComments(html)), signals: LIVE_LABEL };
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    return withArchive(hit, match[2], { context, reason: error.message });
  }
}

async function readThreads({ client, context }, hits, settings) {
  const rows = [...hits];
  const limit = Math.min(settings.threads, hits.length);
  let next = 0;
  async function work() {
    while (next < limit) {
      const index = next;
      next += 1;
      rows[index] = await withComments(client, hits[index], context);
    }
  }
  await Promise.all(Array.from({ length: settings.concurrency }, work));
  return rows;
}

export async function search({ query, limit, subreddit, urls = [] }, context) {
  const settings = settingsOf(context);
  const client = createClient(context, settings);
  const hits = urls.length > 0 ? await hitsFromUrls(client, urls) : await searchHits(client, { query, limit, subreddit });
  const rows = await readThreads({ client, context }, hits, settings);
  return rows.map(({ text, ...row }) => ({ ...row, description: text }));
}
