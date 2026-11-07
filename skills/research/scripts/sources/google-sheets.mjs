import { BlockedRoute, getText } from './http.mjs';

const SHEET_PATH = /^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/;
const NOT_PUBLIC = 'sheet is not public';

export function sheetRoute(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'docs.google.com') return null;
  const match = SHEET_PATH.exec(parsed.pathname);
  if (!match) return null;
  const urls = candidates(match[1], gidOf(parsed));
  return { name: 'google-sheets', fetchText: (target, context) => firstCsv(urls, context) };
}

function gidOf(parsed) {
  const fromQuery = parsed.searchParams.get('gid');
  if (fromQuery) return fromQuery;
  return new URLSearchParams(parsed.hash.slice(1)).get('gid') || '0';
}

function candidates(id, gid) {
  const base = `https://docs.google.com/spreadsheets/d/${id}`;
  return [`${base}/export?format=csv&gid=${gid}`, `${base}/gviz/tq?tqx=out:csv&gid=${gid}`];
}

async function attempt(url, context) {
  try {
    return { text: await fetchCsv(url, context) };
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    return { error };
  }
}

async function firstCsv(urls, context) {
  const failures = [];
  for (const url of urls) {
    const result = await attempt(url, context);
    if (result.error) failures.push(result.error);
    else return result.text;
  }
  throw failures.find((error) => error.message === NOT_PUBLIC) || failures[0];
}

async function fetchCsv(url, context) {
  const seen = { finalUrl: url, type: '' };
  const text = await getText(url, { ...context, fetchImpl: recording(context.fetchImpl ?? fetch, seen) });
  if (isLogin(seen, text)) throw new BlockedRoute(NOT_PUBLIC);
  return text;
}

function recording(fetchImpl, seen) {
  return async (url, options) => {
    const response = await fetchImpl(url, options);
    seen.finalUrl = response.url || url;
    seen.type = response.headers.get('content-type') || '';
    return response;
  };
}

function isLogin({ finalUrl, type }, text) {
  if (new URL(finalUrl).hostname === 'accounts.google.com') return true;
  if (type.includes('text/html')) return true;
  return /^\s*<(!doctype html|html)/i.test(text);
}
