const DROPPED_BLOCKS = /<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAGS = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|pre|blockquote)\b[^>]*>/gi;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

export function htmlToText(html) {
  const withoutNoise = html.replace(/<!--[\s\S]*?-->/g, '').replace(DROPPED_BLOCKS, ' ');
  const text = decodeEntities(withoutNoise.replace(BLOCK_TAGS, '\n').replace(/<[^>]*>/g, ''));
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function pageText(body, contentType) {
  if (/html|xml/i.test(contentType ?? '')) return htmlToText(body);
  return body.trim();
}
