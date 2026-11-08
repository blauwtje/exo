import { getJson, isoDate } from './http.mjs';

export async function search({ query, limit }, context) {
  const url = `https://old.reddit.com/search.json?sort=relevance&limit=${limit}&q=${encodeURIComponent(query)}`;
  const body = await getJson(url, context);
  return body.data.children.map(({ data }) => ({
    title: data.title,
    url: `https://www.reddit.com${data.permalink}`,
    date: isoDate(data.created_utc),
    signals: { score: data.score, comments: data.num_comments },
  }));
}
