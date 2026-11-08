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

function attribute(opening, name) {
  const match = opening.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : '';
}

function commentOf(chunk) {
  const opening = chunk.slice(0, chunk.indexOf('>'));
  const body = chunk.match(/slot="comment">([\s\S]*?)(?=<div data-hl|<faceplate-loader|<div[^>]*slot="actionRow"|$)/);
  if (!body) return [];
  return [{
    author: attribute(opening, 'author'),
    score: Number(attribute(opening, 'score')),
    depth: Number(attribute(opening, 'depth')),
    text: htmlToText(body[1]),
  }];
}

export function parseComments(html) {
  const chunks = html.split('<shreddit-comment ').slice(1);
  return chunks.flatMap(commentOf);
}

export function commentsAsText(comments) {
  return comments
    .map(({ author, score, depth, text }) => `${author} (score ${score}, depth ${depth}): ${text}`)
    .join('\n');
}
