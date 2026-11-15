import { getJson, resultList } from './http.mjs';

export async function search({ query, limit }, context) {
  const params = `action=query&list=search&format=json&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`;
  const url = `https://en.wikipedia.org/w/api.php?${params}`;
  const body = await getJson(url, context);
  return resultList(body.query?.search, url).map((hit) => ({
    title: hit.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replaceAll(' ', '_'))}`,
    date: hit.timestamp.slice(0, 10),
    signals: { words: hit.wordcount },
  }));
}
