import { getJson, resultList } from './http.mjs';

export async function search({ query, limit }, context) {
  const params = `action=query&list=search&format=json&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`;
  const body = await getJson(`https://en.wikipedia.org/w/api.php?${params}`, context);
  return resultList(body.query?.search).map((hit) => ({
    title: hit.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replaceAll(' ', '_'))}`,
    date: hit.timestamp.slice(0, 10),
    signals: { words: hit.wordcount },
  }));
}
