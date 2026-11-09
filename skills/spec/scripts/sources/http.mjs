import { gateRequest } from '../../../watch/scripts/request-gate.mjs';
import { createHostState } from './host-state.mjs';

const USER_AGENT = 'Mozilla/5.0 (compatible; exo-research)';

const NOT_PUBLIC = new Set([401, 403, 451]);

export class BlockedRoute extends Error {}

function refuseKnownBlock(url, hostState) {
  if (hostState.isBlocked(url)) throw new BlockedRoute('url was blocked earlier in this run');
  if (hostState.isOpen(new URL(url).hostname)) throw new BlockedRoute('host breaker is open after repeated 429 or 5xx');
}

export async function getText(url, context, userAgent = USER_AGENT) {
  const { fetchImpl = fetch, gate = {}, stateDir } = context;
  const hostState = stateDir ? createHostState({ dir: stateDir }) : null;
  if (hostState) refuseKnownBlock(url, hostState);
  await gateRequest(url, gate);
  const response = await fetchImpl(url, { headers: { 'user-agent': userAgent }, redirect: 'follow' });
  hostState?.recordStatus(new URL(url).hostname, response.status);
  if (NOT_PUBLIC.has(response.status)) hostState?.recordBlocked(url);
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
