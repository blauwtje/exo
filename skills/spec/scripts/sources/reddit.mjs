import os from 'node:os';
import { environmentMs } from '#script-flags';
import { runDefaults } from '../../../build/scripts/run-config.mjs';
import { createClient, threadWait } from './reddit-bucket.mjs';
import { splitSubreddit } from './reddit-discover.mjs';
import { commentsAsText, parseMoreChildren, parseSearchPage, parseThread, searchUrl } from './reddit-text.mjs';

const WAIT_CAP_MS = 65_000;
const THREAD_MS = 45_000;
const THREAD_PATH = /\/(?:r\/(\w+)\/)?(?:comments|posts)\/(\w+)/;

function settingsOf(context) {
  const configured = context.defaults ?? runDefaults(os.homedir()).reddit ?? {};
  return { concurrency: 3, capacity: 3, refillMs: 400, waitCapMs: WAIT_CAP_MS, threadMs: environmentMs('EXO_REDDIT_THREAD_MS', THREAD_MS), now: context.now ?? Date.now, ...configured };
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
    addComments(state, parseMoreChildren(JSON.parse(await client.get(moreChildrenUrl(id, ids), { wait }))));
  } catch {
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
