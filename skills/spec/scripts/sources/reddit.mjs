import { BlockedRoute, getJson, isoDate } from './http.mjs';

const USER_AGENT = 'exo-research/1.0 (spec source search; read-only)';
const ENDPOINTS = ['https://old.reddit.com/search.json', 'https://www.reddit.com/search.json'];
const NEXT_STEP = 'use web search with site:reddit.com and never WebFetch reddit.com or a mirror';

async function firstAnswer(query, limit, context) {
  const params = `sort=relevance&limit=${limit}&q=${encodeURIComponent(query)}`;
  const reasons = [];
  for (const endpoint of ENDPOINTS) {
    try {
      return await getJson(`${endpoint}?${params}`, context, USER_AGENT);
    } catch (error) {
      if (!(error instanceof BlockedRoute)) throw error;
      reasons.push(error.message);
    }
  }
  throw new BlockedRoute(`${reasons.join(', ')}; ${NEXT_STEP}`);
}

export async function search({ query, limit }, context) {
  const body = await firstAnswer(query, limit, context);
  if (!Array.isArray(body?.data?.children)) throw new BlockedRoute(`answer had no result list; ${NEXT_STEP}`);
  return body.data.children.map(({ data }) => ({
    title: data.title,
    url: `https://www.reddit.com${data.permalink}`,
    date: isoDate(data.created_utc),
    signals: { score: data.score, comments: data.num_comments },
  }));
}
