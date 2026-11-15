import { BlockedRoute } from './http.mjs';
import { ENTITIES } from '../page-text.mjs';

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

export function commentsAsText(comments) {
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

export function parseMoreChildren(body, linkId) {
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
