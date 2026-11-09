const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/g;
const LEADING_NUMBER = /^(\d+)(?![\w.]*\w)/;

function distinctUrls(prompt) {
  const urls = (prompt.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;:!?]+$/, ''));
  return new Set(urls).size;
}

export function fetchFields(prompt, value, requireFetches) {
  const stated = LEADING_NUMBER.exec(value ?? '')?.[1];
  if (value !== undefined) return { count: Number(stated ?? 0), invalid: stated === undefined, lacking: false };
  const count = requireFetches ? distinctUrls(prompt) : 0;
  return { count, invalid: false, lacking: requireFetches && count === 0 };
}
