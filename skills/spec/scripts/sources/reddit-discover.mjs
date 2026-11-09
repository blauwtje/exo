import { BlockedRoute, getJson } from './http.mjs';
import { attributeOf, parseSearch } from './reddit-text.mjs';
import { archiveSignals, captureDate } from './reddit-archive.mjs';

const POSTS_URL = 'https://arctic-shift.photon-reddit.com/api/posts/search';
const WINDOW_MS = { hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 };

export function searchUrl(text, limit, scope = {}) {
  const { subreddit, sort = 'relevance', time = 'all' } = scope;
  const query = encodeURIComponent(text);
  const window = `sort=${sort}&t=${time}&limit=${limit}`;
  if (subreddit) return `https://www.reddit.com/r/${subreddit}/search.rss?q=${query}&restrict_sr=1&${window}`;
  return `https://www.reddit.com/search.rss?q=${query}&${window}`;
}

function listingUrl({ subreddit, sort, time }) {
  const order = sort === 'relevance' ? 'new' : sort;
  return `https://www.reddit.com/svc/shreddit/community-more-posts/${order}/?name=${subreddit}&t=${time}`;
}

export function parseListing(html, limit) {
  const seen = new Set();
  const hits = [];
  for (const chunk of html.split('<shreddit-post ').slice(1)) {
    const opening = chunk.slice(0, chunk.indexOf('>'));
    const permalink = attributeOf(opening, 'permalink');
    if (!permalink || seen.has(permalink)) continue;
    seen.add(permalink);
    hits.push({
      title: attributeOf(opening, 'post-title'),
      url: `https://www.reddit.com${permalink}`,
      date: attributeOf(opening, 'created-timestamp').slice(0, 10),
      text: `score ${attributeOf(opening, 'score')}, comments ${attributeOf(opening, 'comment-count')}`,
      counts: `score ${attributeOf(opening, 'score')}, comments ${attributeOf(opening, 'comment-count')}`,
    });
  }
  return hits.slice(0, limit);
}

export function splitSubreddit(query, subreddit) {
  const inline = query.match(/(?:^|\s)r\/(\w+)/);
  if (!inline) return { subreddit, text: query };
  const text = query.replace(inline[0], ' ').replace(/\s+/g, ' ').trim();
  return { subreddit: subreddit || inline[1], text };
}

export async function listingHits(client, scope, limit) {
  if (!scope.subreddit) throw new BlockedRoute('no subreddit to list');
  if (!client.hasBudget('shreddit')) throw new BlockedRoute('no Reddit budget for the subreddit listing');
  const hits = parseListing(await client.get(listingUrl(scope)), limit);
  if (hits.length === 0) throw new BlockedRoute('subreddit listing had no posts');
  return hits;
}

export async function rssHits(client, scope, { text, limit }) {
  if (!client.hasBudget()) throw new BlockedRoute('no Reddit budget for the RSS search');
  const atom = await client.get(searchUrl(text, limit, scope));
  if (!atom.includes('<feed')) throw new BlockedRoute('answer was not an Atom feed');
  return parseSearch(atom);
}

function archiveCounts(post) {
  const known = [post.score, post.num_comments].every((value) => Number.isFinite(Number(value)) && value !== null && value !== undefined);
  return known ? `score ${post.score}, comments ${post.num_comments}` : 'score and comment count unavailable';
}

export async function archiveHits(scope, { text, limit, reason }, context) {
  const params = new URLSearchParams({ sort: 'desc', limit: String(limit), query: text });
  if (scope.subreddit) params.set('subreddit', scope.subreddit);
  const windowMs = WINDOW_MS[scope.time];
  const now = context.now ?? Date.now;
  if (windowMs) params.set('after', new Date(now() - windowMs).toISOString().slice(0, 10));
  const body = await getJson(`${POSTS_URL}?${params}`, { fetchImpl: context.fetchImpl, gate: context.gate, stateDir: context.stateDir });
  return (body.data ?? []).map((post) => ({
    title: post.title,
    url: `https://www.reddit.com${post.permalink}`,
    date: new Date(post.created_utc * 1000).toISOString().slice(0, 10),
    text: post.selftext ?? '',
    archiveCounts: archiveCounts(post),
    signals: archiveSignals({ retrievedOn: captureDate(post), counts: archiveCounts(post), reason }),
  }));
}
