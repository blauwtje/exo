import { getText } from './http.mjs';

const ENTRY = /<entry>([\s\S]*?)<\/entry>/g;

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

export async function search({ query, limit }, context) {
  const url = `https://export.arxiv.org/api/query?max_results=${limit}&search_query=all:${encodeURIComponent(query)}`;
  const feed = await getText(url, context);
  return [...feed.matchAll(ENTRY)].map(([, block]) => ({
    title: tag(block, 'title'),
    url: tag(block, 'id').replace('http://', 'https://').replace(/v\d+$/, ''),
    date: tag(block, 'published').slice(0, 10),
    signals: {},
  }));
}
