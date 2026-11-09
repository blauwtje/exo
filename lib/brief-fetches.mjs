import { readFileSync } from 'node:fs';
const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/g;
const LEADING_NUMBER = /^(\d+)(?![\w.]*\w)/;

const SEARCH_SCRIPT = new URL('../skills/spec/scripts/search.mjs', import.meta.url);

export const FETCH_UNIT = Number(/const DEFAULT_LIMIT = (\d+)/.exec(readFileSync(SEARCH_SCRIPT, 'utf8'))[1]);

const SOURCE_LISTS = /search\.mjs\W[^\n]*--source[\s=]+(?:"([^"]*)"|'([^']*)'|([^\s"']+))|\bSources:([^\n]*)/gi;
const REDDIT_ITEM = /^reddit\b/i;
const THREAD_HOST = /^https?:\/\/(?:[\w-]+\.)?(?:reddit\.com|redd\.it)\//i;

function distinctUrls(prompt) {
  const urls = (prompt.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;:!?]+$/, ''));
  return [...new Set(urls)];
}

function listsReddit(match) {
  const items = match.slice(1).find((value) => value !== undefined).split(',');
  return items.some((item) => REDDIT_ITEM.test(item.trim()));
}

function callUnit(prompt) {
  const onRedditRoute = [...prompt.matchAll(SOURCE_LISTS)].some(listsReddit);
  return onRedditRoute ? FETCH_UNIT : 1;
}

export function fetchPages(fetched) {
  return fetched.count * fetched.callUnit + fetched.pages;
}

export function fetchFields(prompt, value, requireFetches) {
  const stated = LEADING_NUMBER.exec(value ?? '')?.[1];
  if (value !== undefined) return { count: Number(stated ?? 0), pages: 0, invalid: stated === undefined, lacking: false, callUnit: callUnit(prompt) };
  const urls = distinctUrls(prompt);
  const threads = urls.filter((url) => THREAD_HOST.test(url)).length;
  const count = requireFetches ? Math.ceil(threads / FETCH_UNIT) : 0;
  const pages = requireFetches ? urls.length - threads : 0;
  return { count, pages, invalid: false, lacking: requireFetches && count + pages === 0, callUnit: FETCH_UNIT };
}
