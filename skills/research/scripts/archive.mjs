import { gateRequest } from '../../watch/scripts/request-gate.mjs';

const AVAILABLE = 'https://archive.org/wayback/available?url=';

function snapshotDate(timestamp) {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

async function get(url, { fetchImpl, gate, headers }) {
  await gateRequest(url, gate);
  const response = await fetchImpl(url, { headers, redirect: 'follow' });
  return response.ok ? response : null;
}

async function closestTimestamp(url, context) {
  const response = await get(`${AVAILABLE}${encodeURIComponent(url)}`, context);
  if (!response) return null;
  const body = await response.json().catch(() => null);
  const closest = body?.archived_snapshots?.closest;
  if (!closest?.available || !/^\d{8,14}$/.test(closest.timestamp ?? '')) return null;
  return closest.timestamp;
}

export async function waybackSnapshot(url, context) {
  const timestamp = await closestTimestamp(url, context);
  if (!timestamp) return null;
  const response = await get(`https://web.archive.org/web/${timestamp}id_/${url}`, context);
  if (!response) return null;
  return { response, html: await response.text(), date: snapshotDate(timestamp) };
}
