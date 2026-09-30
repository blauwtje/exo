// benchmarks/prose-density.mjs
// Scores the article density of chat prose, the measure the terse drift
// harness gates on. Chat prose is the text minus fenced code, inline code,
// URLs, path and file-name tokens, double-quoted text, blockquote lines and
// table rows. Linking verbs are reported only, never gated.

const ARTICLES = new Set(['a', 'an', 'the']);
const LINKING_VERBS = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being']);
const WORD = /\p{L}[\p{L}'’-]*/gu;

function isExcludedToken(token) {
  const bare = token.replace(/[.,;:!?)\]}]+$/, '');
  return /[/\\]/.test(bare) || /\w\.[a-z][a-z0-9]{0,4}$/i.test(bare);
}

export function chatProse(text) {
  const lines = text
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .split('\n')
    .filter((line) => !/^\s*[>|]/.test(line));
  return lines
    .join('\n')
    .replace(/`[^`]*`/g, ' ')
    .replace(/"[^"]*"|“[^”]*”/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/\s+/)
    .filter((token) => !isExcludedToken(token))
    .join(' ');
}

export function scoreProse(text) {
  const words = chatProse(text).match(WORD) ?? [];
  let articles = 0;
  let linkingVerbs = 0;
  for (const word of words) {
    const lower = word.toLowerCase();
    if (ARTICLES.has(lower)) articles += 1;
    if (LINKING_VERBS.has(lower)) linkingVerbs += 1;
  }
  const articleRate = words.length === 0 ? 0 : Math.round((articles / words.length) * 1000) / 10;
  return { words: words.length, articles, linkingVerbs, articleRate };
}
