import { getJson, isoDate, resultList } from './http.mjs';

export async function search({ query, limit }, context) {
  const params = `order=desc&sort=relevance&site=stackoverflow&pagesize=${limit}&q=${encodeURIComponent(query)}`;
  const url = `https://api.stackexchange.com/2.3/search/advanced?${params}`;
  const body = await getJson(url, context);
  return resultList(body.items, url).map((item) => ({
    title: item.title,
    url: item.link,
    date: isoDate(item.creation_date),
    signals: { score: item.score, answers: item.answer_count, accepted: Boolean(item.accepted_answer_id) },
  }));
}
