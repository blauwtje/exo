import { getJson, resultList } from './http.mjs';

export async function search({ query, limit }, context) {
  const url = `https://hn.algolia.com/api/v1/search?tags=story&query=${encodeURIComponent(query)}&hitsPerPage=${limit}`;
  const body = await getJson(url, context);
  return resultList(body.hits).map((hit) => ({
    title: hit.title,
    url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    date: hit.created_at.slice(0, 10),
    signals: { points: hit.points, comments: hit.num_comments },
  }));
}
