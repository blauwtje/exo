import os from 'node:os';
import process from 'node:process';
import { environmentMs } from '#script-flags';
import { runDefaults } from '../../../build/scripts/run-config.mjs';
import { createBucket } from './reddit-bucket.mjs';
import { BlockedRoute } from './http.mjs';
import { commentsAsText, parseComments, parseSearch } from './reddit-text.mjs';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const WAIT_CAP_MS = 15_000;
const FALLBACK_RESET_S = 10;
const FALLBACK = 'pass thread urls from a site:reddit.com web search and never WebFetch reddit.com or a mirror';
const THREAD_PATH = /\/r\/(\w+)\/comments\/(\w+)/;

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function settingsOf(context) {
  const configured = context.defaults ?? runDefaults(os.homedir()).reddit ?? {};
  return { threads: 5, concurrency: 3, capacity: 3, refillMs: 400, ...configured };
}

function createClient(context, settings) {
  const { fetchImpl = fetch, sleep = sleepFor, now = Date.now, env = process.env } = context;
  const capMs = environmentMs('EXO_REDDIT_WAIT_MS', WAIT_CAP_MS, env);
  const bucket = createBucket({ capacity: settings.capacity, refillMs: settings.refillMs, now, sleep });

  async function waitForReset(response) {
    const seconds = Number.parseFloat(response.headers.get('x-ratelimit-reset'));
    const waitMs = (Number.isFinite(seconds) ? seconds : FALLBACK_RESET_S) * 1000;
    if (waitMs > capMs) throw new BlockedRoute(`rate limited for ${waitMs} ms, over EXO_REDDIT_WAIT_MS=${capMs}`);
    await sleep(waitMs);
  }

  async function get(url, canRetry = true) {
    await bucket.take();
    const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' }, redirect: 'follow' });
    if (response.status === 429 && canRetry) {
      await waitForReset(response);
      return get(url, false);
    }
    if (!response.ok) throw new BlockedRoute(`HTTP ${response.status}`);
    return response.text();
  }

  return { get };
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
  if (!feedUrl) return hit;
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

async function withComments(client, hit) {
  const match = hit.url.match(THREAD_PATH);
  if (!match) return hit;
  const html = await client.get(`https://www.reddit.com/svc/shreddit/comments/r/${match[1]}/t3_${match[2]}`);
  return { ...hit, comments: commentsAsText(parseComments(html)) };
}

async function readThreads(client, hits, settings) {
  const rows = [...hits];
  const state = { next: 0, blocked: '' };
  const limit = Math.min(settings.threads, hits.length);

  async function work() {
    while (state.next < limit && !state.blocked) {
      const index = state.next;
      state.next += 1;
      try {
        rows[index] = await withComments(client, hits[index]);
      } catch (error) {
        if (!(error instanceof BlockedRoute)) throw error;
        state.blocked = error.message;
      }
    }
  }

  await Promise.all(Array.from({ length: settings.concurrency }, work));
  if (!state.blocked) return rows;
  const note = `${state.blocked}; ${FALLBACK}`;
  return rows.map((row) => (row.comments === undefined ? { ...row, blocked: note } : row));
}

export async function search({ query, limit, subreddit, urls = [] }, context) {
  const settings = settingsOf(context);
  const client = createClient(context, settings);
  const hits = urls.length > 0 ? await hitsFromUrls(client, urls) : await searchHits(client, { query, limit, subreddit });
  const rows = await readThreads(client, hits, settings);
  return rows.map(({ text, ...row }) => ({ ...row, description: text }));
}
