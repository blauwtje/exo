import os from 'node:os';
import { runDefaults } from '../../../build/scripts/run-config.mjs';
import { createClient, threadWait } from './reddit-bucket.mjs';
import { BlockedRoute } from './http.mjs';
import { archiveHits, listingHits, rssHits, searchUrl, parseListing, splitSubreddit } from './reddit-discover.mjs';

export { searchUrl, parseListing, splitSubreddit };
import { LIVE_LABEL, archiveSignals, readArchiveComments } from './reddit-archive.mjs';
import { commentsAsText, parseComments, parseMoreLinks, parseSearch } from './reddit-text.mjs';

const WAIT_CAP_MS = 65_000;
const MORE_COMMENTS_LIMIT = 5;
const FALLBACK = 'pass thread urls to search.mjs --url and never WebFetch reddit.com or a mirror';

const THREAD_PATH = /\/(?:r\/(\w+)\/comments|posts)\/(\w+)/;

function settingsOf(context) {
  const configured = context.defaults ?? runDefaults(os.homedir()).reddit ?? {};
  return { concurrency: 3, capacity: 3, refillMs: 400, waitCapMs: WAIT_CAP_MS, ...configured };
}

async function searchHits(client, { query, limit, subreddit, sort = 'new', time = 'all' }, context) {
  const target = splitSubreddit(query, subreddit);
  const scope = { subreddit: target.subreddit, sort, time };
  try {
    return await (target.text ? rssHits(client, scope, { text: target.text, limit }) : listingHits(client, scope, limit));
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    return archiveHits(scope, { text: target.text, limit, reason: error.message }, context).catch((archiveError) => {
      throw new BlockedRoute(`${error.message}; ${archiveError.message}; ${FALLBACK}`);
    });
  }
}

function threadFeedUrl(url) {
  const id = url.match(THREAD_PATH)?.[2];
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
  const slug = url.match(/\/(?:comments|posts)\/\w+\/([^/?#]+)/)?.[1] ?? '';
  return { title: slug.replace(/_/g, ' '), url, date: '', text: '' };
}

async function hitsFromUrls(client, urls) {
  const [first, ...rest] = urls.map(hitFromUrl);
  return [await withPost(client, first), ...rest];
}

async function withArchive(hit, threadId, { context, reason }) {
  try {
    const comments = await readArchiveComments(threadId, context);
    const retrievedOn = comments.map((comment) => comment.retrievedOn).filter(Boolean).sort().at(-1) ?? 'unknown';
    const counts = hit.counts ?? hit.archiveCounts ?? 'score and comment count unavailable';
    const signals = archiveSignals({ retrievedOn, counts, reason });
    return { ...hit, comments: commentsAsText(comments), signals };
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    return { ...hit, blocked: `${reason}; ${error.message}; ${FALLBACK}`, signals: `live and archive both failed; ${hit.signals ?? 'no capture date'}` };
  }
}

async function readLiveComments(client, threadUrl, wait) {
  const html = await client.get(threadUrl, { wait });
  const comments = parseComments(html);
  const queue = parseMoreLinks(html);
  const seen = new Set(queue);
  for (let followed = 0; followed < MORE_COMMENTS_LIMIT && queue.length > 0; followed += 1) {
    let partial;
    try {
      partial = await client.get(`https://www.reddit.com${queue.shift()}`, { method: 'POST', wait });
    } catch (error) {
      if (!(error instanceof BlockedRoute)) throw error;
      return { comments, truncated: error.message };
    }
    comments.push(...parseComments(partial));
    const fresh = parseMoreLinks(partial).filter((link) => !seen.has(link));
    fresh.forEach((link) => seen.add(link));
    queue.push(...fresh);
  }
  return { comments };
}

function liveSignals(hit, { comments, truncated }) {
  const parts = [LIVE_LABEL, hit.counts ?? 'score and comment count unavailable', `${comments.length} comments read`];
  if (truncated) parts.push(`truncated: ${truncated}`);
  if (hit.signals) parts.push(`post text: ${hit.signals}`);
  return parts.join('; ');
}

async function withComments({ client, context }, hit) {
  const match = hit.url.match(THREAD_PATH);
  if (!match) return hit;
  const wait = threadWait(client.capMs, client.pauseFor);
  try {
    const read = await readLiveComments(client, `https://www.reddit.com/svc/shreddit/comments/r/${match[1] ?? 'all'}/t3_${match[2]}`, wait);
    return { ...hit, comments: commentsAsText(read.comments), signals: liveSignals(hit, read) };
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    return withArchive(hit, match[2], { context, reason: error.message });
  }
}

async function readThreads({ client, context }, hits, { settings, limit: callLimit }) {
  const limit = Math.min(callLimit ?? hits.length, hits.length);
  const rows = hits.map((hit, index) => (index < limit ? hit : { ...hit, signals: 'not read: over the search limit' }));
  let next = 0;
  async function work() {
    while (next < limit) {
      const index = next;
      next += 1;
      rows[index] = await withComments({ client, context }, hits[index]);
    }
  }
  await Promise.all(Array.from({ length: settings.concurrency }, work));
  return rows;
}

export async function search({ query, limit, subreddit, sort, time, urls = [] }, context) {
  const settings = settingsOf(context);
  const client = createClient(context, settings);
  const hits = urls.length > 0 ? await hitsFromUrls(client, urls) : await searchHits(client, { query, limit, subreddit, sort, time }, context);
  const rows = await readThreads({ client, context }, hits, { settings, limit });
  return rows.map(({ text, ...row }) => ({ ...row, description: text }));
}
