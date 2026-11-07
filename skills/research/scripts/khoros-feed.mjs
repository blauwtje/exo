import { gateRequest } from '../../watch/scripts/request-gate.mjs';
import { htmlToText } from './page-text.mjs';

const THREAD = /^\/discussions\/([\w-]+)\/[^/]+\/(\d+)\/?$/;
const ITEM = /<item>([\s\S]*?)<\/item>/gi;

function decodeCdata(value) {
  return value.replace(/^<!\[CDATA\[|\]\]>$/g, '');
}

function tag(item, name) {
  const found = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(item);
  return found ? decodeCdata(found[1].trim()) : '';
}

export function feedUrl(url) {
  const parsed = new URL(url);
  const match = THREAD.exec(parsed.pathname);
  if (!match) return null;
  return { feed: `${parsed.origin}/t5/s/rss/board?board.id=${match[1]}`, id: match[2] };
}

function itemText(item) {
  const title = tag(item, 'title');
  const body = htmlToText(tag(item, 'description').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  return `${title}\n${body}`.trim();
}

export async function khorosFeedText(url, { fetchImpl, gate, headers }) {
  const target = feedUrl(url);
  if (!target) return null;
  await gateRequest(target.feed, gate);
  const response = await fetchImpl(target.feed, { headers, redirect: 'follow' });
  if (!response.ok) return null;
  const xml = await response.text();
  const wanted = new RegExp(`[/#]${target.id}\\b|/m-p/${target.id}\\b`);
  for (const [, item] of xml.matchAll(ITEM)) {
    if (wanted.test(item)) return itemText(item);
  }
  return null;
}
