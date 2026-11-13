const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const BLOCK_END = /<(?:br|\/p|\/div|\/li)\s*\/?>/gi;

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== '#') return NAMED[name.toLowerCase()] ?? whole;
    const isHex = name[1].toLowerCase() === 'x';
    const code = isHex ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return String.fromCodePoint(code);
  });
}

export function htmlToText(html) {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(BLOCK_END, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(stripped)
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n\s*/g, '\n')
    .trim();
}

function tagBody(entry, tag) {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? match[1] : '';
}

export function parseSearch(atom) {
  const entries = [...atom.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  return entries.flatMap(([, entry]) => {
    const href = entry.match(/<link[^>]*href="([^"]*\/comments\/[^"]*)"/)?.[1];
    if (!href) return [];
    return [{
      title: htmlToText(tagBody(entry, 'title')),
      url: decodeEntities(href),
      date: tagBody(entry, 'updated').slice(0, 10),
      text: htmlToText(decodeEntities(tagBody(entry, 'content'))),
    }];
  });
}

export function attributeOf(opening, name) {
  const match = opening.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : '';
}

function commentOf(chunk) {
  const opening = chunk.slice(0, chunk.indexOf('>'));
  const body = chunk.match(/slot="comment">([\s\S]*?)(?=<div data-hl|<faceplate-loader|<div[^>]*slot="actionRow"|$)/);
  if (!body) return [];
  return [{
    author: attributeOf(opening, 'author'),
    score: Number(attributeOf(opening, 'score')),
    depth: Number(attributeOf(opening, 'depth')),
    text: htmlToText(body[1]),
  }];
}

export function parseComments(html) {
  const chunks = html.split('<shreddit-comment ').slice(1);
  return chunks.flatMap(commentOf);
}

export function parseMoreLinks(html) {
  const links = [...html.matchAll(/<faceplate-partial[^>]*\ssrc="(\/svc\/shreddit\/more-comments\/[^"]*)"/g)];
  return [...new Set(links.map(([, src]) => decodeEntities(src)))];
}

export function commentsAsText(comments) {
  return comments
    .map(({ author, score, depth, text }) => `${author} (score ${score}, depth ${depth}): ${text}`)
    .join('\n');
}

const SEARCH_ORIGIN = 'https://www.reddit.com';

export function searchUrl({ query, sort = 'relevance', time = 'all', subreddit = '' }) {
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

export function parseMoreChildren(body) {
  const things = body.json?.data?.things;
  if (!Array.isArray(things)) throw new Error('morechildren answer has no things');
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
