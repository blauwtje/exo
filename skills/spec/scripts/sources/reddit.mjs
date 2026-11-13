import os from 'node:os';
import { runDefaults } from '../../../build/scripts/run-config.mjs';
import { createClient, threadWait } from './reddit-bucket.mjs';
import { BlockedRoute } from './http.mjs';
import { splitSubreddit } from './reddit-discover.mjs';
import { commentsAsText, parseSearchPage, parseThread, searchUrl } from './reddit-text.mjs';

const WAIT_CAP_MS = 65_000;
const MORE_CALLS = 5;
const THREAD_PATH = /\/(?:r\/(\w+)\/)?(?:comments|posts)\/(\w+)/;

function settingsOf(context) {
  const configured = context.defaults ?? runDefaults(os.homedir()).reddit ?? {};
  return { concurrency: 3, capacity: 3, refillMs: 400, waitCapMs: WAIT_CAP_MS, moreCalls: MORE_CALLS, ...configured };
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
  return `https://www.reddit.com${path}.json?limit=500&raw_json=1`;
}

async function readThread(client, id, { wait, moreCalls }) {
  const { post, comments, moreIds } = parseThread(JSON.parse(await client.get(threadUrl(id), { wait })));
  const seen = new Set(comments.map((comment) => comment.id));
  for (let followed = 0; followed < moreCalls && moreIds.length > 0; followed += 1) {
    try {
      const part = parseThread(JSON.parse(await client.get(threadUrl(id, moreIds.shift()), { wait })));
      comments.push(...part.comments.filter((comment) => !seen.has(comment.id)));
      part.comments.forEach((comment) => seen.add(comment.id));
      moreIds.push(...part.moreIds);
    } catch (error) {
      if (!(error instanceof BlockedRoute)) throw error;
      return { post, comments, truncated: error.message };
    }
  }
  return { post, comments };
}

function signalsOf({ post, comments, truncated }) {
  const read = `read ${comments.length} of ${post.commentCount} comments`;
  return truncated ? `${read}; truncated: ${truncated}` : read;
}

async function withComments(client, hit, settings) {
  const id = hit.url.match(THREAD_PATH)?.[2];
  if (!id) return hit;
  const wait = threadWait(client.capMs, client.pauseFor);
  const read = await readThread(client, id, { wait, moreCalls: settings.moreCalls });
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
