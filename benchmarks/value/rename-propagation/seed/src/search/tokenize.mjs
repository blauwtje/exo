const STOPWORDS = new Set(['a', 'an', 'and', 'for', 'of', 'the', 'with']);

export function tokenize(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !STOPWORDS.has(token));
}
