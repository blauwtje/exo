import { BlockedRoute, getJson } from './http.mjs';

const ARCHIVE_NAME = 'Arctic Shift archive';
const ARCHIVE_LAG = '24-48 h behind live Reddit';
const TREE_URL = 'https://arctic-shift.photon-reddit.com/api/comments/tree';

export const ARCHIVE_LABEL = `${ARCHIVE_NAME}, ${ARCHIVE_LAG}`;
export const LIVE_LABEL = 'live Reddit';

function childrenOf(replies) {
  if (Array.isArray(replies)) return replies;
  return replies?.data?.children ?? [];
}

function flatten(nodes, depth = 0) {
  return nodes.flatMap((node) => {
    const data = node?.data;
    if (node?.kind === 'more' || !data?.body) return [];
    const comment = { author: data.author, score: Number(data.score), depth, text: data.body };
    return [comment, ...flatten(childrenOf(data.replies), depth + 1)];
  });
}

export async function readArchiveComments(threadId, context) {
  const url = `${TREE_URL}?link_id=t3_${threadId}&limit=100`;
  const body = await getJson(url, { fetchImpl: context.fetchImpl, gate: context.gate, stateDir: context.stateDir }).catch((error) => {
    throw new BlockedRoute(`${ARCHIVE_NAME} ${error.message}`);
  });
  if (!Array.isArray(body.data)) throw new BlockedRoute(`${ARCHIVE_NAME} answer had no comment tree`);
  return flatten(body.data);
}
