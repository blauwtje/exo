import { BlockedRoute, getJson } from './http.mjs';

const TREE_URL = 'https://arctic-shift.photon-reddit.com/api/comments/tree';

export const ARCHIVE_LABEL = 'Arctic Shift archive';
export const LIVE_LABEL = 'live Reddit';

function childrenOf(replies) {
  if (Array.isArray(replies)) return replies;
  return replies?.data?.children ?? [];
}

export function captureDate(data) {
  const seconds = Number(data.retrieved_on ?? data._meta?.retrieved_on);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export function archiveSignals({ retrievedOn = 'unknown', counts, reason }) {
  return `${ARCHIVE_LABEL}; retrieved_on ${retrievedOn}; ${counts}; live failure: ${reason}`;
}

function flatten(nodes, depth = 0) {
  return nodes.flatMap((node) => {
    const data = node?.data;
    if (node?.kind === 'more' || !data?.body) return [];
    const comment = { author: data.author, score: Number(data.score), depth, text: data.body, retrievedOn: captureDate(data) };
    return [comment, ...flatten(childrenOf(data.replies), depth + 1)];
  });
}

export async function readArchiveComments(threadId, context) {
  const url = `${TREE_URL}?link_id=t3_${threadId}&limit=100`;
  const body = await getJson(url, { fetchImpl: context.fetchImpl, gate: context.gate, stateDir: context.stateDir }).catch((error) => {
    throw new BlockedRoute(`${ARCHIVE_LABEL} ${error.message}`);
  });
  if (!Array.isArray(body.data)) throw new BlockedRoute(`${ARCHIVE_LABEL} answer had no comment tree`);
  return flatten(body.data);
}
