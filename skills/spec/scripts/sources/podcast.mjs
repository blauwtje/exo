import { getJson, resultList } from './http.mjs';

export async function search({ query, limit }, context) {
  const url = `https://itunes.apple.com/search?media=podcast&limit=${limit}&term=${encodeURIComponent(query)}`;
  const body = await getJson(url, context);
  return resultList(body.results).map((show) => ({
    title: show.collectionName,
    url: show.collectionViewUrl,
    date: (show.releaseDate ?? '').slice(0, 10),
    signals: { episodes: show.trackCount },
  }));
}
