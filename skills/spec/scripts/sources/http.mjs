import { gateRequest } from '../../../watch/scripts/request-gate.mjs';

const USER_AGENT = 'Mozilla/5.0 (compatible; exo-research)';

export class BlockedRoute extends Error {}

export async function getText(url, context, userAgent = USER_AGENT) {
  const { fetchImpl = fetch, gate = {} } = context;
  await gateRequest(url, gate);
  const response = await fetchImpl(url, { headers: { 'user-agent': userAgent }, redirect: 'follow' });
  if (!response.ok) throw new BlockedRoute(`HTTP ${response.status}`);
  return response.text();
}

export async function getJson(url, context, userAgent) {
  const body = await getText(url, context, userAgent);
  try {
    return JSON.parse(body);
  } catch {
    throw new BlockedRoute('answer was not JSON');
  }
}

export function isoDate(seconds) {
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
}

export function resultList(list) {
  if (!Array.isArray(list)) throw new BlockedRoute('answer had no result list');
  return list;
}
